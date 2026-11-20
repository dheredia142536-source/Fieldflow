import { buildRouter } from '../lib/routes.mjs';

const handle = buildRouter();

// Vercel Functions: ruta comodín /api/* (la URL original se conserva).
const run = (req) => handle(req);
export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
export default run;
