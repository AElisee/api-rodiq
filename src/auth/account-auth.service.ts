import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SignInDto } from './dto/sign-in.dto';
import type { SignUpDto } from './dto/sign-up.dto';
import { Account } from './entities/account.entity';
import { hashPassword, verifyPassword } from './passwords';

@Injectable()
export class AccountAuthService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  async signUp({ password, whatsapp, ...data }: SignUpDto) {
    if (await this.accounts.existsBy({ email: data.email })) {
      throw new ConflictException('Cette adresse e-mail est déjà utilisée');
    }
    // TODO réservations / commandes : rattacher l'historique passé sans compte avec le même e-mail
    return this.accounts.save(
      this.accounts.create({
        ...data,
        whatsapp: whatsapp ?? null,
        passwordHash: await hashPassword(password),
      }),
    );
  }

  async signIn({ email, password }: SignInDto) {
    const account = await this.accounts.findOne({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (!(await verifyPassword(account?.passwordHash, password))) {
      throw new UnauthorizedException('E-mail ou mot de passe incorrect');
    }
    return this.findById(account!.id);
  }

  async findById(id: string) {
    const account = await this.accounts.findOneBy({ id });
    if (!account) throw new UnauthorizedException('Compte introuvable');
    return account;
  }
}
