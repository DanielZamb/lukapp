import type { Catalog } from "../../types";
import { access } from "./access";
import { budget } from "./budget";
import { categories } from "./categories";
import { common } from "./common";
import { drafts } from "./drafts";
import { feedback } from "./feedback";
import { home } from "./home";
import { lifecycle } from "./lifecycle";
import { places } from "./places";
import { planning } from "./planning";
import { recovery } from "./recovery";
import { review } from "./review";
import { settings } from "./settings";
import { setup } from "./setup";

export const es: Catalog = { access, budget, categories, common, drafts, feedback, home, lifecycle, places, planning, recovery, review, settings, setup };
