import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("delete unclaimed report screenshots", { hourUTC: 9, minuteUTC: 0 }, internal.feedbackStore.sweepUnclaimedUploads, {});

export default crons;
