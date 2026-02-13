import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { IssuesService } from "./issues.service";
import { IssueStatus } from "../../generated/prisma/client";

@Controller("issues")
export class IssuesController {
  constructor(private service: IssuesService) {}

  @Get()
  list(
    @Query("boardId") boardId: string,
    @Query("sprintId") sprintId?: string,
  ) {
    return this.service.list({ boardId, sprintId: sprintId ?? null });
  }

  @Post()
  create(
    @Body() body: {
      boardId: string;
      sprintId: string | null;
      title: string;
      description?: string;
      status: IssueStatus;
      order: number;
      assigneeId?: string | number | null;
      watcherIds?: Array<string | number>;
    },
  ) {
    return this.service.create(body);
  }

  // I'd strongly recommend making this /issues/batch
  @Patch("batch")
  batchPatch(@Body() body: Array<{ id: string; patch: any }>) {
    return this.service.batchPatch(body);
  }

  @Patch(":id")
  patch(@Param("id") id: string, @Body() patch: any) {
    return this.service.patch(id, patch);
  }
}
