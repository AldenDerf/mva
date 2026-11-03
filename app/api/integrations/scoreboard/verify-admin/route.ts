import {
  handleVerifyAdminRequest,
  methodNotAllowedResponse,
} from "@/lib/integrations/scoreboard-catalog";
import { prismaScoreboardCatalogStore } from "@/lib/integrations/scoreboard-catalog-prisma";

export async function POST(request: Request) {
  return handleVerifyAdminRequest(request, {
    store: prismaScoreboardCatalogStore,
  });
}

export async function GET() {
  return methodNotAllowedResponse("POST");
}

export async function PUT() {
  return methodNotAllowedResponse("POST");
}

export async function PATCH() {
  return methodNotAllowedResponse("POST");
}

export async function DELETE() {
  return methodNotAllowedResponse("POST");
}
