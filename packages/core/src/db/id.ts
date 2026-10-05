import { randomUUID } from "node:crypto";

/**
 * schema.prisma declares `@default(cuid())`, which Prisma Client computes
 * client-side. Writing rows through raw SQL means we generate the id
 * ourselves — a prefixed UUID is not a cuid, but it satisfies the same
 * contract (opaque, unique, sortable-enough, safe as a URL segment) until
 * Prisma Client is in the loop.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
