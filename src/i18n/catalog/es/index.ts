import type { Catalog } from "../../types";
import { common } from "./common";
import { drafts } from "./drafts";
import { lifecycle } from "./lifecycle";
import { settings } from "./settings";

export const es: Catalog = { common, drafts, lifecycle, settings };
