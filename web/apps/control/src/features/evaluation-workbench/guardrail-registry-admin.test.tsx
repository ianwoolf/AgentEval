/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { GuardrailRegistryAdmin } from "./guardrail-registry-admin";

afterEach(cleanup);

it("filters instances by provider and saves additions and edits together", async () => {
  const original = {revision: "1:1", registry: {version: 1, providers: [{
    id: "f5", name: "F5", instances: [{
      id: "existing", name: "Existing instance", address: "https://f5.test/scans", enabled: true, verify_ssl: true,
    }],
  }, {id: "nemo guardrail", name: "NeMo Guardrail", instances: []}]}};
  const request = vi.fn(async (_token: string, _path: string, method?: string, body?: unknown) =>
    method === "PUT" ? body : original);
  render(<GuardrailRegistryAdmin token="test" request={async <T,>(...args: Parameters<typeof request>) => await request(...args) as T}/>);
  const user = userEvent.setup();
  await screen.findByText("Existing instance");
  await user.click(screen.getByRole("button", {name: "Add provider"}));
  let dialog = within(screen.getByRole("dialog"));
  await user.type(dialog.getByLabelText("Provider ID"), "production-guard");
  await user.type(dialog.getByLabelText("Provider name"), "Production Guard");
  await user.click(dialog.getByRole("button", {name: "Apply"}));
  expect(screen.queryByText("Existing instance")).toBeNull();

  await user.click(screen.getByRole("button", {name: "Add instance"}));
  dialog = within(screen.getByRole("dialog"));
  await user.type(dialog.getByLabelText("Instance ID"), "new");
  await user.type(dialog.getByLabelText("Scan endpoint URL"), "https://nemo.test/scans");
  await user.click(dialog.getByRole("button", {name: "Apply"}));
  expect(screen.getByText("https://nemo.test/scans")).toBeTruthy();

  await user.selectOptions(screen.getByLabelText("Provider", {exact: true}), "f5");
  expect(screen.queryByText("https://nemo.test/scans")).toBeNull();
  await user.click(screen.getByRole("button", {name: "Edit instance existing"}));
  dialog = within(screen.getByRole("dialog"));
  await user.click(dialog.getByLabelText("Enabled"));
  await user.click(dialog.getByRole("button", {name: "Apply"}));
  expect(screen.getByText("Disabled", {exact: true})).toBeTruthy();

  await user.click(screen.getByRole("button", {name: "Save registry"}));
  await screen.findByText("Guardrail registry saved.");
  expect(request).toHaveBeenLastCalledWith("test", "guardrail-registry", "PUT", {
    revision: "1:1", registry: {version: 1, providers: [
      {...original.registry.providers[0], instances: [{...original.registry.providers[0].instances[0], enabled: false}]},
      original.registry.providers[1],
      {id: "production-guard", name: "Production Guard", instances: [{id: "new", name: "", address: "https://nemo.test/scans", enabled: true, verify_ssl: true}]},
    ]},
  });
});
