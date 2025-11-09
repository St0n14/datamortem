import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";

const loginMock = vi.fn();

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

import { LoginView } from "../views/LoginView";

describe("LoginView", () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  test("shows marketing bullets and default credentials", () => {
    render(<LoginView />);
    expect(screen.getByText(/Investiguez depuis n'importe quel cloud/i)).toBeInTheDocument();
    expect(screen.getByText(/Default credentials:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Créer un compte/i })).toBeDisabled();
  });

  test("submits username and password via auth context", async () => {
    const user = userEvent.setup();
    render(<LoginView />);

    await user.type(screen.getByLabelText(/Username/i), "analyst");
    await user.type(screen.getByLabelText(/Password/i), "secret");
    await user.click(screen.getByRole("button", { name: /Se connecter/i }));

    expect(loginMock).toHaveBeenCalledWith("analyst", "secret");
  });
});
