// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useGrafHoejde } from "./use-graf-hoejde";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("reserves only the fetching graph's settled height and releases it when fetching ends", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ height: 157 } as DOMRect);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  function Body({ busy }: { busy: boolean }) {
    const { ref, style } = useGrafHoejde(busy);
    return <div ref={ref} style={style} data-testid="body" />;
  }
  const graf1 = render(<Body busy={false} />);
  const graf2 = render(<Body busy={false} />);
  act(() => graf1.rerender(<Body busy />));
  const bodies = document.querySelectorAll<HTMLElement>("[data-testid=body]");
  expect(bodies[0].style.minHeight).toBe("157px");
  expect(bodies[1].style.minHeight).toBe("");
  act(() => graf1.rerender(<Body busy={false} />));
  expect(bodies[0].style.minHeight).toBe("");
  graf2.unmount();
});