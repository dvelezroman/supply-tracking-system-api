import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LotsService } from '../lots/lots.service';
import { QrService } from '../../common/services/qr.service';

@Injectable()
export class PublicTraceService {
  constructor(
    private readonly lotsService: LotsService,
    private readonly qrService: QrService,
    private readonly configService: ConfigService,
  ) {}

  async getPublicTrace(lotCode: string) {
    const { lot, events } = await this.lotsService.getHistory(lotCode);

    const frontendUrl =
      this.configService.get<string>('frontendUrl') ?? 'http://localhost:4200';
    const traceUrl = `${frontendUrl}/trace/${lotCode}`;
    const qrDataUrl = await this.qrService.generateDataUrl(traceUrl);

    return {
      lot: {
        lotCode: lot.lotCode,
        product: {
          name: lot.product.name,
          sku: lot.product.sku,
          category: lot.product.category,
        },
        presentation: lot.presentation,
        packaging: lot.packaging,
        weightKg: lot.weightKg,
        sizeClassification: lot.sizeClassification,
        colorSalmoFan: lot.colorSalmoFan,
        texture: lot.texture,
        certifications: lot.certifications,
        lotSizeLbs: lot.lotSizeLbs,
        harvestDate: lot.harvestDate,
        poolNumber: lot.poolNumber,
        harvestWeightGrams: lot.harvestWeightGrams,
        origin: {
          farm:       { name: lot.farm.name,       location: lot.farm.location },
          lab:        { name: lot.lab.name,         location: lot.lab.location },
          maturation: { name: lot.maturation.name,  location: lot.maturation.location },
          coPacker:   { name: lot.coPacker.name,    location: lot.coPacker.location },
        },
      },
      events: events.map((e) => ({
        eventType: e.eventType,
        timestamp: e.timestamp,
        location:  e.location,
        notes:     e.notes,
        actor: {
          name:     e.actor.name,
          type:     e.actor.type,
          location: e.actor.location,
        },
        metadata: e.metadata,
      })),
      qrCode: qrDataUrl,
      traceUrl,
      generatedAt: new Date().toISOString(),
    };
  }
}
