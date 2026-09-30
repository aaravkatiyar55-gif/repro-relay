type Attr = string | number | boolean | ((event: Event) => void) | null | undefined;
export type Child = Node | string | false | null | undefined;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, Attr> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const child of children) if (child !== false && child !== null && child !== undefined) node.append(child);
  for (const [key,value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2),value);
    else if (key === 'class') node.className = String(value);
    else if (key === 'value') (node as HTMLInputElement).value = String(value);
    else if (key === 'checked') (node as HTMLInputElement).checked = Boolean(value);
    else if (value === true) node.setAttribute(key,'');
    else node.setAttribute(key,String(value));
  }
  return node;
}
export function button(text: string, action: () => void, style = 'secondary', disabled = false): HTMLButtonElement {
  return h('button',{type:'button',class:`button ${style}`,onclick:action,disabled},text);
}
export function field(label: string, value: string, change: (value: string) => void, options: { area?: boolean; max?: number; hint?: string; required?: boolean; type?: string } = {}): HTMLElement {
  const fieldId = crypto.randomUUID(), hintId = fieldId + '-hint';
  const attrs = { id:fieldId,value,maxlength:options.max ?? 2000,required:options.required,'aria-describedby':options.hint ? hintId : undefined,oninput:(event: Event) => change((event.target as HTMLInputElement).value) };
  const input = options.area ? h('textarea',{...attrs,rows:3}) : h('input',{...attrs,type:options.type ?? 'text'});
  return h('div',{class:'field'},h('label',{for:fieldId},label, options.required ? ' *' : ''),input,options.hint ? h('small',{id:hintId},options.hint) : null);
}
export function selectField(label: string, value: string, entries: {value:string;label:string}[], change: (value:string) => void): HTMLElement {
  const fieldId = crypto.randomUUID();
  return h('div',{class:'field'},h('label',{for:fieldId},label),h('select',{id:fieldId,value,onchange:(event:Event) => change((event.target as HTMLSelectElement).value)},...entries.map(entry => h('option',{value:entry.value},entry.label))));
}
export const badge = (text: string, type = '') => h('span',{class:`badge ${type}`},text);
export const notice = (text: string, type = '') => h('div',{class:`notice ${type}`},text);
