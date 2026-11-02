import 'dotenv/config';
import { app } from './app.js';
import { prisma } from './shared/prisma.js';
import { syncCoreRoles } from './modules/master/syncRoles.js';

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, async () => {
  console.log(`[PMO UTama ERP API] Server berjalan pada http://localhost:${PORT}/api/v1`);
  await syncCoreRoles(prisma);
});
