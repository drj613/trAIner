import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoutineBuilderClient } from "./RoutineBuilderClient";

const mockSaveProgram = jest.fn().mockResolvedValue(undefined);
jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: mockSaveProgram }),
}));
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
}));

it("explains unfinished saving while preserving an empty training day and a rest day", async () => {
  const user = userEvent.setup();
  render(<RoutineBuilderClient />);
  fireEvent.change(screen.getByPlaceholderText("e.g. Upper / Lower 4-day"), { target: { value: "Unfinished routine" } });
  await user.click(screen.getByRole("button", { name: /^2$/ }));
  await user.click(screen.getByRole("button", { name: "Set up days →" }));
  await user.click(screen.getAllByRole("button", { name: /^Train$/ })[1]);
  await user.click(screen.getByRole("button", { name: "Edit days →" }));
  await user.click(screen.getByRole("button", { name: "Add section" }));
  await user.click(screen.getByRole("button", { name: /Strength Heavy compound work/ }));
  expect(screen.getByText(/Save the routine unfinished and add exercises later/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save routine" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Save routine" }));
  await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
  const program = mockSaveProgram.mock.calls[0][0];
  expect(program.days[0].sections[0]).toMatchObject({ type: "strength", groups: [] });
  expect(program.days[1].sections).toEqual([]);
});
