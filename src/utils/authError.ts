import { FirebaseError } from 'firebase/app';

const messages: Record<string, string> = {
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/invalid-email': 'Digite um e-mail válido.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão. Verifique a internet e tente novamente.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
};

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return messages[error.code] ?? 'Não foi possível concluir. Tente novamente.';
  }

  if (error instanceof Error && error.message.startsWith('Não foi possível')) return error.message;

  return 'Não foi possível concluir. Verifique sua conexão e tente novamente.';
}
