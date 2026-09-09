import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mountedRoots = new Map<Root, HTMLDivElement>();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

export async function renderComponent(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.set(root, container);

  const rerender = async (next: ReactNode) => {
    await act(async () => root.render(next));
  };
  await rerender(node);

  return {
    container,
    rerender,
    unmount: async () => {
      if (!mountedRoots.has(root)) return;
      await act(async () => root.unmount());
      mountedRoots.delete(root);
      container.remove();
    },
  };
}

export async function cleanupRenderComponents() {
  for (const [root, container] of mountedRoots) {
    await act(async () => root.unmount());
    container.remove();
  }
  mountedRoots.clear();
}
