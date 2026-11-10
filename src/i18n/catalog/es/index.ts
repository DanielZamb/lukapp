import type { Catalog } from "../../types";
import { common } from "./common";
import { drafts } from "./drafts";
import { feedback } from "./feedback";
import { inbox } from "./inbox";
import { lifecycle } from "./lifecycle";
import { posting } from "./posting";
import { settings } from "./settings";

export const es: Catalog = { common, drafts, feedback, inbox, lifecycle, posting, settings };
