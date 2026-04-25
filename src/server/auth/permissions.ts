export type Role = "guest" | "user" | "admin";

export type GuardContext = {
  role: Role;
  projectAllowGuest?: boolean;
};

export function isGuest(role: Role): boolean {
  return role === "guest";
}

export function isAdmin(role: Role): boolean {
  return role === "admin";
}

const guestAllowed = (ctx: GuardContext): boolean => {
  // Безопасный дефолт: гостям разрешено только при явном allowGuest=true.
  return ctx.projectAllowGuest === true;
};

export function canCreateTask(ctx: GuardContext): boolean {
  if (isAdmin(ctx.role) || ctx.role === "user") return true;
  return guestAllowed(ctx);
}

export function canComment(ctx: GuardContext): boolean {
  if (isAdmin(ctx.role) || ctx.role === "user") return true;
  return guestAllowed(ctx);
}

export function canChangeStatus(ctx: GuardContext): boolean {
  if (isAdmin(ctx.role) || ctx.role === "user") return true;
  return guestAllowed(ctx);
}

export function canChangePriority(ctx: GuardContext): boolean {
  if (isAdmin(ctx.role) || ctx.role === "user") return true;
  return guestAllowed(ctx);
}

export function canManageProject(ctx: GuardContext): boolean {
  // Управление проектами только для admin.
  return isAdmin(ctx.role);
}
