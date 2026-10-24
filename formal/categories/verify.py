#!/usr/bin/env python3
"""Run the category checks and optional isolated real-source mutation rehearsal."""

import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[2]
AREA = ROOT / "formal/categories"
CONFIG = "formal/categories/vitest.config.ts"
VERIFIER_FILES = [
    "formal/categories/categories.test.ts", "formal/categories/vitest.config.ts",
    "formal/categories/tsconfig.json", "formal/categories/verify.py",
    "formal/categories/coverage.json", ".agents/skills/verify-categories/SKILL.md",
]
MUTATIONS = [
    {
        "name": "account-answer-falls-through", "property": "P1 ",
        "path": "src/accounting/commands/createUserCategory.ts",
        "before": 'selection.kind === "custom" &&\n    (selection.answer === "stillMine" || selection.answer === "payDebt")',
        "after": "false",
        "counterexample": "Create Savings with stillMine. It must request account setup and leave categories empty; the mutant inserts an Income category.",
    },
    {
        "name": "explicit-spend-becomes-income", "property": "P1 ",
        "path": "src/accounting/commands/createUserCategory.ts",
        "before": 'selection.answer === "spend"\n        ? "Expense"',
        "after": 'selection.answer === "spend"\n        ? "Income"',
        "counterexample": "Create Cafe with spend. The mutant classifies the saved category as Income.",
    },
    {
        "name": "duplicate-retry-inserts-again", "property": "P2 ",
        "path": "src/accounting/commands/createUserCategory.ts",
        "before": "if (existing) {", "after": "if (false && existing) {",
        "counterexample": "Create Cafe, then retry as CAFE with surrounding spaces. The mutant creates another identity.",
    },
    {
        "name": "restyle-rewrites-classification", "property": "P2 ",
        "path": "convex/store.ts",
        "before": "await db.patch(id, { style });",
        "after": 'await db.patch(id, { style, nature: "Income" });',
        "counterexample": "Create an Expense, then change its appearance. The mutant changes its accounting nature to Income.",
    },
    {
        "name": "foreign-workspace-edit", "property": "P3 ",
        "path": "src/accounting/commands/restyleUserCategory.ts",
        "before": "if (!category || category.workspaceId !== input.workspaceId || category.deletedAt !== undefined)",
        "after": "if (!category)",
        "counterexample": "Use workspace A to restyle a category owned by workspace B. The mutant accepts the edit.",
    },
    {
        "name": "foreign-workspace-read", "property": "P3 ",
        "path": "convex/store.ts",
        "before": '.query("userCategories")\n        .withIndex("by_workspace", (q) =>\n          q.eq("workspaceId", storedId<"workspaces">(workspaceId)),\n        )',
        "after": '.query("userCategories")',
        "counterexample": "Read workspace A after creating a category in B. The mutant includes both workspaces in the response.",
    },
    {
        "name": "foreign-category-can-post", "property": "P4 ",
        "path": "src/accounting/categories/posting.ts",
        "before": "if (!category || category.workspaceId !== workspace.id)",
        "after": "if (!category)",
        "counterexample": "Post in workspace A using B's same-nature category. The mutant accepts a foreign category identity.",
    },
    {
        "name": "four-categories-can-post", "property": "P4b ",
        "path": "src/accounting/categories/assignments.ts",
        "before": "if (ids.length > maxTransactionCategories)",
        "after": "if (ids.length > maxTransactionCategories + 1)",
        "counterexample": "Choose four valid local expenses sharing a posting account. The mutant accepts the fourth category.",
    },
    {
        "name": "picker-allows-four", "property": "P5 ",
        "path": "apps/mobile/src/features/categories/transactionSelection.ts",
        "before": "if (ids.length > 3) return null;", "after": "if (ids.length > 4) return null;",
        "counterexample": "Start with a,b,c selected and toggle d. The mutant returns four selected categories.",
    },
    {
        "name": "picker-skips-primary", "property": "P6 ",
        "path": "apps/mobile/src/features/categories/transactionSelection.ts",
        "before": "!needsPrimary(selection.ids, categories) ||", "after": "true ||",
        "counterexample": "Select Food and Dining with no primary. The mutant enables posting despite different posting accounts.",
    },
    {
        "name": "setup-commits-with-an-account-answer", "property": "P7 ",
        "path": "convex/personalDefaults.ts",
        "before": 'throw new ConvexError({\n        code: "account_setup_required",\n        message: "Add a place for this money before continuing",\n      });',
        "after": "continue;",
        "counterexample": "Submit spend followed by stillMine during first setup. The mutant commits partial setup instead of rolling back the workspace and first category.",
    },
    {
        "name": "foreign-workspace-update", "property": "P3 ",
        "path": "src/accounting/commands/updateUserCategory.ts",
        "before": "if (!category || category.workspaceId !== input.workspaceId || category.deletedAt !== undefined)",
        "after": "if (!category || category.deletedAt !== undefined)",
        "counterexample": "Rename a category in B through workspace A. The mutant changes the foreign record.",
    },
    {
        "name": "foreign-workspace-delete", "property": "P3 ",
        "path": "src/accounting/commands/deleteUserCategory.ts",
        "before": "if (!category || category.workspaceId !== input.workspaceId)",
        "after": "if (!category)",
        "counterexample": "Delete a category in B through workspace A. The mutant hides the foreign record.",
    },
    {
        "name": "delete-erases-history", "property": "P8 ",
        "path": "convex/store.ts",
        "before": "await db.patch(id, { deletedAt });", "after": "await db.delete(id);",
        "counterexample": "Post with Cafe, then delete it. Hard deletion loses its history label and makes the saved posting retry fail.",
    },
    {
        "name": "update-rewrites-nature", "property": "P8 ",
        "path": "convex/store.ts",
        "before": "await db.patch(id, changes);", "after": 'await db.patch(id, { ...changes, nature: "Income" });',
        "counterexample": "Rename an expense. The mutant silently changes its nature to Income.",
    },
    {
        "name": "delete-breaks-cash-retry", "property": "P8 ",
        "path": "src/accounting/cashActivity.ts",
        "before": "prior !== undefined,", "after": "false,",
        "counterexample": "Post, delete the category, then retry the same post. The mutant rejects the saved retry.",
    },
    {
        "name": "deleted-category-stays-selectable", "property": "P8 ",
        "path": "src/accounting/queries/listUserCategories.ts",
        "before": ".filter((category) => category.deletedAt === undefined)", "after": ".filter(() => true)",
        "counterexample": "Delete a category, then list active choices. The mutant still returns the deleted identity.",
    },
    {
        "name": "deleted-category-keeps-budget-jar", "property": "P8 ",
        "path": "convex/budgetStore.ts",
        "before": ".filter((category) => category.deletedAt === undefined)", "after": ".filter(() => true)",
        "counterexample": "Delete a category with a limit. The mutant keeps a jar for a category that can no longer be selected.",
    },
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(checkout, evidence, name, pattern=None):
    report = evidence / f"{name}.json"
    command = [str(ROOT / "node_modules/.bin/vitest"), "run", "--config", CONFIG,
               "--reporter=json", "--outputFile", str(report)]
    if pattern:
        command.extend(["--testNamePattern", f"^{pattern}"])
    started = time.monotonic()
    with (evidence / f"{name}.log").open("w") as output:
        result = subprocess.run(command, cwd=checkout, stdout=output,
                                stderr=subprocess.STDOUT, timeout=150)
    data = json.loads(report.read_text()) if report.exists() else {}
    failed = [assertion["fullName"] for suite in data.get("testResults", [])
              for assertion in suite.get("assertionResults", [])
              if assertion["status"] == "failed"]
    return {"exitCode": result.returncode, "seconds": round(time.monotonic() - started, 3),
            "passed": data.get("numPassedTests", 0), "failed": failed,
            "report": str(report), "log": str(evidence / f"{name}.log")}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prove-checks", action="store_true",
                        help="Break covered source in an isolated copy, then restore and rerun it.")
    args = parser.parse_args()
    coverage = json.loads((AREA / "coverage.json").read_text())
    stale = [entry["path"] for entry in coverage["files"]
             if digest(ROOT / entry["path"]) != entry["sha256"]]
    packages = json.loads((ROOT / "package.json").read_text())
    for package, version in coverage["toolVersions"].items():
        declared = {**packages["dependencies"], **packages["devDependencies"]}.get(package)
        if declared != version:
            raise SystemExit(f"Tool version changed: review {package}, expected {version}, got {declared}")
    evidence = ROOT / ".orchestrator/verification/categories" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence.mkdir(parents=True)
    source_before = {entry["path"]: digest(ROOT / entry["path"]) for entry in coverage["files"]}
    verifier_before = {path: digest(ROOT / path) for path in VERIFIER_FILES}
    receipt = {"at": datetime.now(timezone.utc).isoformat(), "syncCommit": coverage["syncCommit"],
               "method": "bounded exhaustive execution of actual TypeScript and Convex public handlers",
               "provider": "local convex-test with synthetic Clerk fixture only",
               "sourceHashes": source_before, "verifierHashes": verifier_before,
               "sourceReviewRequired": stale, "mutations": []}
    with (evidence / "typecheck.log").open("w") as output:
        typecheck = subprocess.run([str(ROOT / "node_modules/.bin/tsc"), "--noEmit", "--project",
                                    "formal/categories/tsconfig.json"], cwd=ROOT, stdout=output,
                                   stderr=subprocess.STDOUT, timeout=150)
    receipt["typecheck"] = {"exitCode": typecheck.returncode, "log": str(evidence / "typecheck.log")}
    receipt["baseline"] = check(ROOT, evidence, "baseline")
    ok = receipt["baseline"]["exitCode"] == 0 and typecheck.returncode == 0
    if args.prove_checks and ok:
        with tempfile.TemporaryDirectory(prefix="lukapp-category-verification-") as temporary:
            scratch = pathlib.Path(temporary)
            for relative in ["src", "convex", "apps/mobile/src", "formal/categories"]:
                shutil.copytree(ROOT / relative, scratch / relative)
            for relative in ["package.json", "tsconfig.json", "pnpm-workspace.yaml"]:
                shutil.copy2(ROOT / relative, scratch / relative)
            (scratch / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
            for mutation in MUTATIONS:
                path = scratch / mutation["path"]
                original = path.read_bytes()
                content = original.decode()
                if content.count(mutation["before"]) != 1:
                    raise SystemExit(f"Mutation anchor changed: review {mutation['name']}")
                try:
                    path.write_text(content.replace(mutation["before"], mutation["after"], 1))
                    outcome = check(scratch, evidence, mutation["name"], mutation["property"])
                    detected = outcome["exitCode"] != 0 and any(
                        name.startswith(mutation["property"]) for name in outcome["failed"])
                    receipt["mutations"].append({
                        "name": mutation["name"], "property": mutation["property"].strip(),
                        "path": mutation["path"], "counterexample": mutation["counterexample"],
                        "detectedByAssertion": detected, **outcome,
                    })
                    ok = ok and detected
                    print(f"{mutation['name']}: {'caught' if detected else 'MISSED OR TOOL ERROR'}", flush=True)
                finally:
                    path.write_bytes(original)
            receipt["restoredCopy"] = check(scratch, evidence, "restored-copy")
            ok = ok and receipt["restoredCopy"]["exitCode"] == 0
    source_after = {path: digest(ROOT / path) for path in source_before}
    receipt["workingSourceUnchanged"] = source_after == source_before
    receipt["verifierUnchanged"] = {path: digest(ROOT / path) for path in VERIFIER_FILES} == verifier_before
    ok = ok and receipt["workingSourceUnchanged"] and receipt["verifierUnchanged"]
    receipt["status"] = "PASS_BOUNDED_LOCAL" if ok and not stale else "SOURCE_REVIEW_REQUIRED" if ok else "FAIL"
    receipt["runtimeAcceptanceClosed"] = False
    destination = evidence / "receipt.json"
    destination.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"{receipt['status']}; receipt: {destination}")
    if stale:
        print("Confirm the coverage against these changed files before updating the sync commit: " + ", ".join(stale))
    raise SystemExit(0 if ok and not stale else 1)


if __name__ == "__main__":
    main()
