import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { Visit, VisitSession, Session } from "../models";
import { Permissions } from "../helpers";

interface IdCache {
  [name: string]: string;
}

@controller("/visits")
export class VisitController extends AttendanceBaseController {
  static cachedSessionIds: IdCache = {};

  private async getSessionId(churchId: string, serviceTimeId: string, groupId: string, currentDate: Date) {
    let result = "";
    const key = currentDate.toDateString() + "_" + serviceTimeId.toString() + "_" + groupId.toString();
    const cached: string = VisitController.cachedSessionIds[key];
    if (cached !== undefined) result = cached;
    else {
      let session: Session = await this.repositories.session.loadByGroupServiceTimeDate(
        churchId,
        groupId,
        serviceTimeId,
        currentDate
      );
      if (session === null) {
        session = { churchId, groupId, serviceTimeId, sessionDate: currentDate };
        session = await this.repositories.session.save(session);
      }
      VisitController.cachedSessionIds[key] = session.id;
      result = session.id;
    }
    return result;
  }

  @httpGet("/checkin")
  public async getCheckin(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view) && !au.checkAccess(Permissions.attendance.checkin))
        return this.json({}, 401);
      else {
        const result: Visit[] = [];
        const serviceId = req.query.serviceId.toString();
        const peopleIdList = req.query.peopleIds.toString().split(",");
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const peopleIds: string[] = [];
        peopleIdList?.forEach((id) => peopleIds.push(id));

        const lastDate = await this.repositories.visit.loadLastLoggedDate(au.churchId, serviceId, peopleIds);

        const visits: Visit[] =
          peopleIds.length === 0
            ? []
            : this.repositories.visit.convertAllToModel(
                au.churchId,
                (await this.repositories.visit.loadByServiceDatePeopleIds(
                  au.churchId,
                  serviceId,
                  lastDate,
                  peopleIds
                )) as any
              );

        const visitIds: string[] = [];
        if (visits.length > 0) {
          visits?.forEach((v) => visitIds.push(v.id));
          const visitSessions: VisitSession[] = this.repositories.visitSession.convertAllToModel(
            au.churchId,
            (await this.repositories.visitSession.loadByVisitIds(au.churchId, visitIds)) as any
          );
          if (visitSessions.length > 0) {
            const sessionIds: string[] = [];
            visitSessions.forEach((vs) => sessionIds.push(vs.sessionId));
            const sessions: Session[] = this.repositories.session.convertAllToModel(
              au.churchId,
              (await this.repositories.session.loadByIds(au.churchId, sessionIds)) as any
            );
            visits?.forEach((v) => {
              v.visitSessions = [];
              visitSessions?.forEach((vs) => {
                if (vs.visitId === v.id) {
                  sessions?.forEach((s) => {
                    if (s.id === vs.sessionId) vs.session = s;
                  });
                  v.visitSessions.push(vs);
                }
              });
              result.push(v);
            });
          }

          // If previous week, make a copy (remove the ids)
          visits?.forEach((v) => {
            if (v.visitDate !== currentDate) {
              v.id = null;
              v.visitSessions?.forEach((vs) => {
                vs.visitId = null;
                vs.id = null;
              });
            }
          });
        }

        return result;
      }
    });
  }

  @httpPost("/checkin")
  public async postCheckin(req: express.Request<{}, {}, Visit[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit) && !au.checkAccess(Permissions.attendance.checkin))
        return this.json({}, 401);
      else {
        const deleteVisitIds: string[] = [];
        const deleteVisitSessionIds: string[] = [];

        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const serviceId = req.query.serviceId.toString();
        const peopleIdList = req.query.peopleIds.toString().split(",");
        const peopleIds: string[] = [];
        peopleIdList.forEach((id) => peopleIds.push(id));

        const submittedVisits = [...req.body];
        submittedVisits.forEach((sv) => {
          sv.churchId = au.churchId;
          sv.visitDate = currentDate;
          sv.checkinTime = new Date();
          sv.addedBy = au.id;
          sv.visitSessions.forEach(async (vs) => {
            vs.sessionId = await this.getSessionId(
              au.churchId,
              vs.session.serviceTimeId,
              vs.session.groupId,
              currentDate
            );
            vs.churchId = au.churchId;
          });
        });

        const existingVisitIds: string[] = [];
        const existingVisits: Visit[] =
          peopleIds.length === 0
            ? []
            : this.repositories.visit.convertAllToModel(
                au.churchId,
                (await this.repositories.visit.loadByServiceDatePeopleIds(
                  au.churchId,
                  serviceId,
                  currentDate,
                  peopleIds
                )) as any
              );
        if (existingVisits.length > 0) {
          existingVisits.forEach((v) => existingVisitIds.push(v.id));
          const visitSessions: VisitSession[] = this.repositories.visitSession.convertAllToModel(
            au.churchId,
            (await this.repositories.visitSession.loadByVisitIds(au.churchId, existingVisitIds)) as any
          );
          this.populateDeleteIds(existingVisits, submittedVisits, visitSessions, deleteVisitIds, deleteVisitSessionIds);
        }

        const promises: Promise<any>[] = [];
        this.getSavePromises(submittedVisits, promises);
        deleteVisitIds.forEach((visitId) => {
          promises.push(this.repositories.visit.delete(au.churchId, visitId));
        });
        deleteVisitSessionIds.forEach((visitSessionId) => {
          promises.push(this.repositories.visitSession.delete(au.churchId, visitSessionId));
        });

        await Promise.all(promises);
        return [];
      }
    });
  }

  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else
        return this.repositories.visit.convertToModel(au.churchId, await this.repositories.visit.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        let result = null;
        if (req.query.personId !== undefined)
          result = await this.repositories.visit.loadForPerson(au.churchId, req.query.personId.toString());
        else result = await this.repositories.visit.loadAll(au.churchId);
        return this.repositories.visit.convertAllToModel(au.churchId, result as any);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Visit[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Visit>[] = [];
        req.body.forEach((visit) => {
          visit.churchId = au.churchId;
          promises.push(this.repositories.visit.save(visit));
        });
        const result = await Promise.all(promises);
        return this.repositories.visit.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        await this.repositories.visit.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private populateDeleteIds(
    existingVisits: Visit[],
    submittedVisits: Visit[],
    visitSessions: VisitSession[],
    deleteVisitIds: string[],
    deleteVisitSessionIds: string[]
  ) {
    existingVisits.forEach((existingVisit) => {
      existingVisit.visitSessions = [];
      visitSessions.forEach((vs) => {
        if (vs.visitId === existingVisit.id) existingVisit.visitSessions.push(vs);
      });

      deleteVisitIds.push(existingVisit.id);
      existingVisit.visitSessions.forEach((vs) => deleteVisitSessionIds.push(vs.id));
    });
  }

  private async getSavePromises(submittedVisits: Visit[], promises: Promise<any>[]) {
    submittedVisits.forEach((submittedVisit) => {
      promises.push(
        this.repositories.visit.save(submittedVisit).then(async (sv) => {
          const sessionPromises: Promise<VisitSession>[] = [];
          sv.visitSessions.forEach((vs) => {
            vs.visitId = sv.id;
            sessionPromises.push(this.repositories.visitSession.save(vs));
          });
          await Promise.all(sessionPromises);
        })
      );
    });
  }
}
