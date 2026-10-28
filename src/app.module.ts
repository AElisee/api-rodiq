import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { BoutiqueModule } from './boutique/boutique.module';
import { CommandesModule } from './commandes/commandes.module';
import { ComptesModule } from './comptes/comptes.module';
import { PrestationsModule } from './prestations/prestations.module';
import { ReservationsModule } from './reservations/reservations.module';
import { SettingsModule } from './settings/settings.module';
import { VisitesModule } from './visites/visites.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.getOrThrow<string>('DB_PORT')),
        database: config.getOrThrow<string>('DB_NAME'),
        username: config.getOrThrow<string>('DB_USER'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        autoLoadEntities: true,
        // Crée/modifie les tables d'après les entités : pratique en dev, à désactiver en prod
        synchronize: config.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    SettingsModule,
    PrestationsModule,
    ReservationsModule,
    BoutiqueModule,
    CommandesModule,
    ComptesModule,
    VisitesModule,
    VisitesModule,
  ],
})
export class AppModule {}
