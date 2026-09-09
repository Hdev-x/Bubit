import { act, StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type HookView<Props, Result> = (props: Props) => Result;
const mountedRoots = new Map<Root, HTMLDivElement>();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export async function renderHook<Props, Result>(
  hook: HookView<Props, Result>,
  initialProps: Props,
  { strict = false }: { strict?: boolean } = {},
) {
  const container = document.createElement('div');
  document.body.append(container);
  const root: Root = createRoot(container);
  mountedRoots.set(root, container);
  let current: Result;

  function Probe({ props }: { props: Props }): ReactNode {
    current = hook(props);
    return null;
  }

  const render = async (props: Props) => {
    const probe = <Probe props={props} />;
    await act(async () => root.render(strict ? <StrictMode>{probe}</StrictMode> : probe));
  };

  await render(initialProps);

  return {
    result: () => current!,
    rerender: render,
    unmount: async () => {
      if (!mountedRoots.has(root)) return;
      await act(async () => root.unmount());
      mountedRoots.delete(root);
      container.remove();
    },
  };
}

export async function cleanupRenderHooks() {
  for (const [root, container] of mountedRoots) {
    await act(async () => root.unmount());
    container.remove();
  }
  mountedRoots.clear();
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
