import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { demoProgram, defaultProfile } from "@/lib/programs/sample";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";
import { profileRepo } from "@/lib/storage/profileRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { LocalDataProvider, useLocalData } from "./LocalDataProvider";

function Consumer({ label }: { label: string }) {
  const { loading, programs } = useLocalData();

  if (loading) {
    return <p>loading-{label}</p>;
  }

  return <p>{`${label}:${programs[0]?.title ?? "missing"}`}</p>;
}

function Harness() {
  const [view, setView] = useState<"first" | "second">("first");

  return (
    <LocalDataProvider>
      <button type="button" onClick={() => setView((current) => (current === "first" ? "second" : "first"))}>
        toggle
      </button>
      {view === "first" ? <Consumer label="first" /> : <Consumer label="second" />}
    </LocalDataProvider>
  );
}

describe("LocalDataProvider", () => {
  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await profileRepo.save(defaultProfile);
    await programRepo.save(demoProgram);
  });

  afterEach(() => {
    resetDbConnection();
    jest.restoreAllMocks();
  });

  it("keeps loaded local data available when consumers remount inside the shared provider", async () => {
    const profileGetSpy = jest.spyOn(profileRepo, "get");
    const programListSpy = jest.spyOn(programRepo, "list");
    const user = userEvent.setup();

    render(<Harness />);

    expect(await screen.findByText(`first:${demoProgram.title}`)).toBeInTheDocument();
    expect(profileGetSpy).toHaveBeenCalledTimes(1);
    expect(programListSpy).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "toggle" }));

    expect(screen.queryByText("loading-second")).not.toBeInTheDocument();
    expect(await screen.findByText(`second:${demoProgram.title}`)).toBeInTheDocument();

    await waitFor(() => {
      expect(profileGetSpy).toHaveBeenCalledTimes(1);
      expect(programListSpy).toHaveBeenCalledTimes(1);
    });
  });
});
