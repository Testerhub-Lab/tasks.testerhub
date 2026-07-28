import { z } from "zod/v4";

export const resourceIDSchema = z.string().trim().min(1).max(191);
