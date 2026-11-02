import {
  handleListTeamsRequest,
  methodNotAllowedResponse,
} from "@/lib/integrations/scoreboard-catalog";
import { prismaScoreboardCatalogStore } from "@/lib/integrations/scoreboard-catalog-prisma";

export async function GET(request: Request) {
  return handleListTeamsRequest(request, {
    store: prismaScoreboardCatalogStore,
  });
}

export async function POST() {
  return methodNotAllowedResponse("GET");
}

export async function PUT() {
  return methodNotAllowedResponse("GET");
}

export async function PATCH() {
  return methodNotAllowedResponse("GET");
}

export async function DELETE() {
  return methodNotAllowedResponse("GET");
}
