/**
 * User Role Enum
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export const SCREEN_USE_BACK_SIDEBAR = ['/library/', '/chat-shared-history/', '/feedback-preview/'];

export const PARENT_OF_SCREEN_USE_BACK_SIDEBAR = ['/library'];

export const REGEX = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PASSWORD: /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
  URL: /^(https?:\/\/[^\s$.?#].[^\s]*)$/,
};
