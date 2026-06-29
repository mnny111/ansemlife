import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Disclaimer } from "./Disclaimer";

describe("Disclaimer", () => {
  it("shows the leverage liquidation warning", () => {
    render(<Disclaimer />);
    expect(screen.getByText(/liquidate the entire position to zero/i)).toBeInTheDocument();
    expect(screen.getByText(/Not financial advice/i)).toBeInTheDocument();
  });
});
