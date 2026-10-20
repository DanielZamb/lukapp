import { httpRouter } from "convex/server";
import { sessionEvents } from "./clerkWebhooks";

const http = httpRouter();
http.route({ path: "/clerk/session-events", method: "POST", handler: sessionEvents });

export default http;
