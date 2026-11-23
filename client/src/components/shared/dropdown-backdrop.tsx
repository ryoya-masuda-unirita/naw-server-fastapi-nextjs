import { BACKDROP_ID } from './dropdown-service';

/** 移植元 app.ts の `<div id="dropdown-backdrop" class="dropdown-backdrop">`。アプリのルートに 1 つ置く */
export function DropdownBackdrop() {
  return <div id={BACKDROP_ID} className="dropdown-backdrop" />;
}
