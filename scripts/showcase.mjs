// Prohlídka produktu se smyšlenými daty. Nikdy nečte skutečné přepisy ani nastavení.
import { pripravUkazku } from './demo-fixture.mjs';

const demo = await pripravUkazku();
console.log(`\nProhlídka aplikace: ${demo.url}/#/prehled\nSmyšlená data, dočasné složky, žádné spouštění skutečných agentů.\nUkončení: Ctrl+C.\n`);
let closing = false;
const stop = async () => { if (closing) return; closing = true; await demo.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
