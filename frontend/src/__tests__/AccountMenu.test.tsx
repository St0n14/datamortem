import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refreshUserMock = vi.fn();
const updateProfileMock = vi.fn().mockResolvedValue({});
const changePasswordMock = vi.fn().mockResolvedValue({ message: "ok" });

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: "analyst",
      email: "analyst@example.com",
      full_name: "Analyst One",
      role: "analyst",
      is_active: true,
      email_verified: false,
      otp_enabled: false,
    },
    refreshUser: refreshUserMock,
  }),
}));

vi.mock("../services/api", () => ({
  authAPI: {
    updateProfile: (...args: unknown[]) => updateProfileMock(...args),
    changePassword: (...args: unknown[]) => changePasswordMock(...args),
  },
}));

vi.mock("../components/SecuritySettingsCard", () => ({
  SecuritySettingsCard: () => <div data-testid="security-card" />,
}));

import { AccountMenu } from "../components/AccountMenu";

describe("AccountMenu", () => {
  beforeEach(() => {
    refreshUserMock.mockReset();
    updateProfileMock.mockClear();
    changePasswordMock.mockClear();
  });

  test("updates profile data via authAPI and refreshes user", async () => {
    const user = userEvent.setup();
    render(<AccountMenu darkMode={false} onClose={() => {}} />);

    await user.clear(screen.getByLabelText(/Nom complet/i));
    await user.type(screen.getByLabelText(/Nom complet/i), "New Name");
    await user.clear(screen.getByLabelText(/Pseudo/i));
    await user.type(screen.getByLabelText(/Pseudo/i), "newanalyst");
    await user.clear(screen.getByLabelText(/^Email$/i));
    await user.type(screen.getByLabelText(/^Email$/i), "new@example.com");

    await user.click(screen.getByRole("button", { name: /Enregistrer/i }));

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith({
        username: "newanalyst",
        email: "new@example.com",
        full_name: "New Name",
      });
    });
    expect(refreshUserMock).toHaveBeenCalled();
  });

  test("shows validation error if password confirmation mismatches and aborts API call", async () => {
    const user = userEvent.setup();
    render(<AccountMenu darkMode={false} onClose={() => {}} />);

    await user.type(screen.getByLabelText(/Mot de passe actuel/i), "oldpass");
    await user.type(screen.getByLabelText(/Nouveau mot de passe/i), "newpassword");
    await user.type(screen.getByLabelText(/Confirmation/i), "different");

    await user.click(screen.getByRole("button", { name: /Mettre à jour/i }));

    expect(await screen.findByText(/Les mots de passe ne correspondent pas/i)).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });
});
