import { element } from '../app/dom';

export type ThemePreference = 'light' | 'dark' | 'system';

/** A view preference only. Never reads or writes legacy user storage. */
export function createThemeControl(document: Document, id: string) {
  const wrapper = element(document, 'div', 'ds-theme');
  const label = element(document, 'label', '', '화면 테마');
  label.htmlFor = id;
  const select = element(document, 'select', 'ds-input');
  select.id = id;
  for (const [value, text] of [
    ['light', '밝게'],
    ['dark', '어둡게'],
    ['system', '기기 설정']
  ] as const) {
    const option = element(document, 'option', '', text);
    option.value = value;
    select.append(option);
  }
  select.value = document.documentElement.dataset.theme ?? 'light';
  const apply = () => {
    document.documentElement.dataset.theme = select.value;
  };
  select.addEventListener('change', apply);
  wrapper.append(label, select);
  return { element: wrapper, dispose: () => select.removeEventListener('change', apply) };
}
