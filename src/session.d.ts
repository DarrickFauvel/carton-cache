import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: "admin" | "manager" | "staff" | "viewer";
    userName: string;
    userLocationIds: string[];
    userAvatarColor: string;
    orgId: string;
    orgPlan: "free" | "pro";
  }
}
