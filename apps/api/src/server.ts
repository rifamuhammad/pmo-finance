import 'dotenv/config';
import { app } from './app.js';

const PORT = Number(process.env.PORT || 4000);

app.listen(PORT, () => {
  console.log(`[PMO UTama ERP API] Server berjalan pada http://localhost:${PORT}/api/v1`);
});
