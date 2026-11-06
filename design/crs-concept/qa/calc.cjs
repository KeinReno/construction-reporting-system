const {auditDataset,parseKopeks,volumeGroups,DATA}=require('../data.js');
const errors=auditDataset();
if(parseKopeks('4800,50')!==480050)errors.push('копейки из 4800,50');
if(parseKopeks('abc')!==null)errors.push('мусор распознан как сумма');
if(parseKopeks('')!==null)errors.push('пустая сумма распознана');
const units=new Set(volumeGroups(DATA.reports).measurable.map(row=>row.type+':'+row.unit));
if(units.size!==volumeGroups(DATA.reports).measurable.length)errors.push('повтор вида с другой единицей');
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('PASS synthetic month control totals');
