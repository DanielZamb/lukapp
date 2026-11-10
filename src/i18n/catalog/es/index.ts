import type { Catalog } from "../../types";
import { budget } from "./budget";
import { categories } from "./categories";
import { common } from "./common";
import { drafts } from "./drafts";
import { feedback } from "./feedback";
import { lifecycle } from "./lifecycle";
import { review } from "./review";
import { settings } from "./settings";

export const es: Catalog = { budget, categories, common, drafts, feedback, lifecycle, review, settings };
