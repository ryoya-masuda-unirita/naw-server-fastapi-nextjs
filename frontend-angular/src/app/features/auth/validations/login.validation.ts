import {
  FormValidationSchema,
  PASSWORD_ASCII_PATTERN,
  PASSWORD_MAX_LENGTH,
} from '@core/constants/validation.config';
import { environment } from '@env/environment';

export type LoginFormField = 'userId' | 'password';

export const LOGIN_VALIDATION: FormValidationSchema<LoginFormField> = {
  userId: {
    required: true,
    minLength: 3,
    maxLength: 50,
  },
  password: {
    required: true,
    minLength: environment.minPasswordLength,
    maxLength: PASSWORD_MAX_LENGTH,
    pattern: PASSWORD_ASCII_PATTERN,
  },
};
