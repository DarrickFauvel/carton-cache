import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: string;
    userRole: "admin" | "manager" | "staff" | "viewer";
    userName: string;
    userLocationIds: string[];
    userAvatarColor: string;
    orgId: string;
    orgName: string;
    orgPlan: "free" | "pro";
    orgUnit: "in" | "cm";
    /** Location last received into, preselected on the next Receive form. Unset until the first receive. */
    lastReceiveLocationId?: string;
    /** Location last consumed from, preselected on the next Consume form. Unset until the first consume. */
    lastConsumeLocationId?: string;
    /** "From" location of the last transfer, preselected on the next Transfer form. Unset until the first transfer. */
    lastTransferFromLocationId?: string;
  }
}
