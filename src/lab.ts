import { newCase } from './model.ts';
import type { Capsule } from './model.ts';
export type BoardVersion = 'broken' | 'fixed';
export interface Registration { id: string; name: string; role: string; checked: boolean }
export const seedRows = (): Registration[] => [
  { id:'mina', name:'Mina', role:'Design', checked:false },
  { id:'sam', name:'Sam', role:'Web', checked:false },
  { id:'jo', name:'Jo', role:'Hardware', checked:false },
];
export function register(rows: Registration[], name: string, version: BoardVersion): Registration[] {
  const trimmed = name.trim();
  if (!trimmed) return rows;
  if (version === 'fixed' && rows.some(row => row.name.toLowerCase() === trimmed.toLowerCase())) return rows;
  return [...rows, { id:crypto.randomUUID(), name:trimmed, role:'Visitor', checked:false }];
}
export function filterRows(rows: Registration[], query: string, version: BoardVersion): Registration[] {
  const needle = (version === 'fixed' ? query.trim() : query).toLowerCase();
  return rows.filter(row => row.name.toLowerCase().includes(needle));
}
export function checkRow(rows: Registration[], visible: Registration[], index: number, version: BoardVersion): Registration[] {
  const targetId = version === 'fixed' ? visible[index]?.id : rows[index]?.id;
  return rows.map(row => row.id === targetId ? { ...row, checked:!row.checked } : row);
}
export function labCase(): Capsule {
  const capsule = newCase();
  capsule.spec = { title:'Club signup board: three small bugs', summary:'A fictional club board with three reproducible mistakes. Try the broken board, change to the fixed version, and check the same steps again.', demoUrl:'', sourceUrl:'', version:'broken-v1', environment:'Built-in fictional browser demo', preconditions:'Reset the board before each step. Start with Mina, Sam and Jo. The board is fictional and does not send registrations anywhere.', steps:[
    { id:'duplicate', action:'Register Alex twice using the same name.', expected:'There is exactly one Alex registration.' },
    { id:'whitespace', action:'Search for "  Mina  " with two spaces on both sides.', expected:'Mina is the only visible match.' },
    { id:'identity', action:'Search for Sam. Mark the first visible row as checked. Clear the search.', expected:'Only Sam is checked; Mina and Jo remain unchecked.' },
  ] };
  return capsule;
}
