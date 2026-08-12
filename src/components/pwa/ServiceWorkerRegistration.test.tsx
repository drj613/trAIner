import { render } from "@testing-library/react";

jest.mock("@/lib/pwa/viteEnv", () => ({ BASE_URL: "/trAIner/", IS_PROD: true }));

import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";

describe("ServiceWorkerRegistration", () => {
  it("registers sw.js under the Vite base path with a matching scope", () => {
    const register = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    render(<ServiceWorkerRegistration />);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("/trAIner/sw.js", { scope: "/trAIner/" });
  });
});
