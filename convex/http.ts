import { httpRouter } from "convex/server";
import { terminalSession } from "./clerkWebhook";

const http = httpRouter();
http.route({ path: "/clerk/session-events", method: "POST", handler: terminalSession });
export default http;
