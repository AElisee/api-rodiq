import * as argon2 from 'argon2';

export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id });

// Empreinte jetable : vérifiée quand l'e-mail est inconnu, pour que la réponse prenne
// le même temps qu'avec un e-mail existant (on ne révèle pas quels comptes existent)
const dummyHash = hashPassword('rodiq-dummy-password');

export const verifyPassword = async (
  hash: string | undefined,
  password: string,
) => {
  if (!hash) {
    await argon2.verify(await dummyHash, password);
    return false;
  }
  return argon2.verify(hash, password);
};
