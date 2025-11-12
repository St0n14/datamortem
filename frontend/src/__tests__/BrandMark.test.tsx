import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { BrandMark } from "../components/BrandMark";

describe("BrandMark", () => {
  test("renders title and default subtitle in dark mode", () => {
    render(<BrandMark />);
    expect(screen.getByText("Requiem")).toBeInTheDocument();
    expect(screen.getByText("Digital Forensics Platform")).toBeInTheDocument();
  });

  test("supports light variant subtitle override", () => {
    render(<BrandMark variant="light" subtitle="Cloud DFIR" />);
    expect(screen.getByText("Cloud DFIR")).toBeInTheDocument();
  });
});
