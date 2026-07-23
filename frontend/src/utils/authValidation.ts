/** Client-side auth rules — keep in sync with backend AuthValidation. */

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 64

const USERNAME_RE = /^[A-Za-z]{3,20}$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,64}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function isValidUsername(value: string): boolean {
    return USERNAME_RE.test(value.trim())
}

export function isValidPassword(value: string): boolean {
    return PASSWORD_RE.test(value)
}

export function isValidEmail(value: string): boolean {
    return EMAIL_RE.test(value.trim())
}
