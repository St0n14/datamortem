"""
Module de validation robuste des mots de passe pour durcir la sécurité.

Ce module implémente des règles de complexité strictes pour les mots de passe :
- Longueur minimale renforcée
- Exigences de caractères (majuscules, minuscules, chiffres, caractères spéciaux)
- Vérification contre les mots de passe courants/faibles
- Protection contre les patterns prévisibles
"""

import re
from typing import List, Tuple, Optional


# Configuration des règles de mot de passe
MIN_PASSWORD_LENGTH = 12
REQUIRE_UPPERCASE = True
REQUIRE_LOWERCASE = True
REQUIRE_DIGITS = True
REQUIRE_SPECIAL_CHARS = True
MIN_SPECIAL_CHARS = 1

# Caractères spéciaux autorisés
SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?"

# Liste de mots de passe courants/faibles à rejeter
COMMON_PASSWORDS = {
    "password", "password123", "password1", "Password123", "Password1",
    "admin", "admin123", "admin1", "Admin123", "Admin1",
    "12345678", "123456789", "1234567890", "12345678901",
    "qwerty", "qwerty123", "qwerty1", "Qwerty123",
    "letmein", "welcome", "welcome123", "Welcome123",
    "monkey", "dragon", "master", "sunshine",
    "iloveyou", "princess", "football", "baseball",
    "trustno1", "shadow", "superman", "qazwsx",
    "michael", "jordan", "tigger", "mustang",
    "access", "thomas", "hunter", "robert",
    "batman", "test", "test123", "Test123",
    "demo", "demo123", "Demo123",
    "changeme", "changeme123", "ChangeMe123",
    "default", "default123", "Default123",
    "root", "root123", "Root123",
    "toor", "toor123", "Toor123",
    "pass", "pass123", "Pass123",
    "user", "user123", "User123",
}


class PasswordValidationError(Exception):
    """Exception levée lorsqu'un mot de passe ne respecte pas les règles de sécurité."""
    pass


def validate_password_strength(password: str) -> Tuple[bool, List[str]]:
    """
    Valide la force d'un mot de passe selon des règles de sécurité strictes.

    Args:
        password: Le mot de passe à valider

    Returns:
        Tuple (is_valid, errors) où:
        - is_valid: True si le mot de passe est valide
        - errors: Liste des erreurs de validation (vide si valide)
    """
    errors: List[str] = []

    # Vérification de la longueur minimale
    if len(password) < MIN_PASSWORD_LENGTH:
        errors.append(
            f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères "
            f"(actuellement {len(password)})"
        )

    # Vérification des majuscules
    if REQUIRE_UPPERCASE and not re.search(r'[A-Z]', password):
        errors.append("Le mot de passe doit contenir au moins une lettre majuscule")

    # Vérification des minuscules
    if REQUIRE_LOWERCASE and not re.search(r'[a-z]', password):
        errors.append("Le mot de passe doit contenir au moins une lettre minuscule")

    # Vérification des chiffres
    if REQUIRE_DIGITS and not re.search(r'\d', password):
        errors.append("Le mot de passe doit contenir au moins un chiffre")

    # Vérification des caractères spéciaux
    if REQUIRE_SPECIAL_CHARS:
        special_count = sum(1 for char in password if char in SPECIAL_CHARS)
        if special_count < MIN_SPECIAL_CHARS:
            errors.append(
                f"Le mot de passe doit contenir au moins {MIN_SPECIAL_CHARS} "
                f"caractère(s) spécial(aux) parmi: {SPECIAL_CHARS}"
            )

    # Vérification contre les mots de passe courants
    if password.lower() in COMMON_PASSWORDS:
        errors.append("Ce mot de passe est trop commun et facilement devinable")

    # Vérification des patterns prévisibles
    # Séquences répétitives (ex: "aaaa", "1111", "abcd")
    if re.search(r'(.)\1{3,}', password):
        errors.append("Le mot de passe ne doit pas contenir de séquences répétitives (ex: aaaa, 1111)")

    # Séquences de clavier (ex: "qwerty", "1234", "abcd")
    keyboard_sequences = [
        "qwerty", "asdfgh", "zxcvbn",
        "123456", "234567", "345678", "456789",
        "abcdef", "bcdefg", "cdefgh",
    ]
    password_lower = password.lower()
    for seq in keyboard_sequences:
        if seq in password_lower or seq[::-1] in password_lower:
            errors.append("Le mot de passe ne doit pas contenir de séquences de clavier prévisibles")
            break

    # Vérification des répétitions de caractères (ex: "abcabc", "123123")
    if len(password) >= 6:
        for i in range(len(password) - 2):
            pattern = password[i:i+3]
            if password.count(pattern) > 1:
                errors.append("Le mot de passe ne doit pas contenir de motifs répétitifs")
                break

    # Vérification que le mot de passe n'est pas uniquement composé de caractères identiques
    if len(set(password)) < 4:
        errors.append("Le mot de passe doit contenir au moins 4 caractères différents")

    return (len(errors) == 0, errors)


def validate_password(password: str) -> None:
    """
    Valide un mot de passe et lève une exception si invalide.

    Args:
        password: Le mot de passe à valider

    Raises:
        PasswordValidationError: Si le mot de passe ne respecte pas les règles
    """
    is_valid, errors = validate_password_strength(password)
    if not is_valid:
        error_message = "Le mot de passe ne respecte pas les règles de sécurité :\n" + "\n".join(f"  - {err}" for err in errors)
        raise PasswordValidationError(error_message)


def get_password_requirements() -> dict:
    """
    Retourne les exigences de mot de passe pour l'affichage à l'utilisateur.

    Returns:
        Dictionnaire contenant les règles de mot de passe
    """
    return {
        "min_length": MIN_PASSWORD_LENGTH,
        "require_uppercase": REQUIRE_UPPERCASE,
        "require_lowercase": REQUIRE_LOWERCASE,
        "require_digits": REQUIRE_DIGITS,
        "require_special_chars": REQUIRE_SPECIAL_CHARS,
        "min_special_chars": MIN_SPECIAL_CHARS,
        "special_chars": SPECIAL_CHARS,
    }


def get_password_requirements_text() -> str:
    """
    Retourne un texte lisible des exigences de mot de passe.

    Returns:
        Texte formaté des exigences
    """
    requirements = get_password_requirements()
    parts = [f"Au moins {requirements['min_length']} caractères"]
    
    if requirements['require_uppercase']:
        parts.append("au moins une lettre majuscule")
    if requirements['require_lowercase']:
        parts.append("au moins une lettre minuscule")
    if requirements['require_digits']:
        parts.append("au moins un chiffre")
    if requirements['require_special_chars']:
        parts.append(f"au moins {requirements['min_special_chars']} caractère(s) spécial(aux) parmi: {requirements['special_chars']}")
    
    return ", ".join(parts)

