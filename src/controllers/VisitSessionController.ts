import { controller, httpPost, httpGet, interfaces, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController"
import { VisitSession, Visit, Session, ServiceTime } from "../models"
import { Permissions } from "../helpers";

@controller("/visitsessions")
export class VisitSessionController extends AttendanceBaseController {

    @httpPost("/log")
    public async log(req: express.Request<{}, {}, Visit>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
            else {
                const sessionId = req.body.visitSessions[0].sessionId;
                const personId = req.body.personId;

                let newVisit = false;
                let visit = await this.repositories.visitSession.loadForSessionPerson(au.churchId, sessionId, personId);
                if (visit == null) {
                    const session: Session = await this.repositories.session.load(au.churchId, sessionId);
                    visit = { addedBy: au.id, checkinTime: new Date(), churchId: au.churchId, personId, visitDate: session.sessionDate };

                    if (session.serviceTimeId === null) visit.groupId = session.groupId;
                    else {
                        const st: ServiceTime = await this.repositories.serviceTime.load(au.churchId, session.serviceTimeId);
                        visit.serviceId = st.serviceId;
                    }
                    await this.repositories.visit.save(visit);
                    newVisit = true;
                }
                let existingSession: VisitSession = null;
                if (!newVisit) existingSession = await this.repositories.visitSession.loadByVisitIdSessionId(au.churchId, visit.id, sessionId);
                if (existingSession == null) {
                    const vs: VisitSession = { churchId: au.churchId, sessionId, visitId: visit.id };
                    await this.repositories.visitSession.save(vs);
                }
                return {};
            }
        });
    }

    @httpGet("/:id")
    public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
            else {
                const data = await this.repositories.visitSession.load(au.churchId, id);
                return this.repositories.visitSession.convertToModel(au.churchId, data);
            }
        });
    }

    @httpGet("/")
    public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
            else {
                let data;
                const sessionId = (req.query.sessionId === undefined) ? "" : req.query.sessionId.toString();
                if (sessionId !== "") data = await this.repositories.visitSession.loadForSession(au.churchId, sessionId);
                else data = await this.repositories.visitSession.loadAll(au.churchId);
                return this.repositories.visitSession.convertAllToModel(au.churchId, data);
            }
        });
    }

    @httpPost("/")
    public async save(req: express.Request<{}, {}, VisitSession[]>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
            else {
                const promises: Promise<VisitSession>[] = [];
                req.body.forEach(visitsession => { visitsession.churchId = au.churchId; promises.push(this.repositories.visitSession.save(visitsession)); });
                const data = await Promise.all(promises);
                return this.repositories.visitSession.convertAllToModel(au.churchId, data);
            }
        });
    }

    @httpDelete("/:id")
    public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
            else {
                await this.repositories.visitSession.delete(au.churchId, id);
                return this.json({});
            }
        });
    }

    @httpDelete("/")
    public async deleteSessionPerson(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
            else {
                const personId = req.query.personId.toString();
                const sessionId = req.query.sessionId.toString();
                const visit = await this.repositories.visit.loadForSessionPerson(au.churchId, sessionId, personId);
                if (visit !== null) {
                    const existingSession = await this.repositories.visitSession.loadByVisitIdSessionId(au.churchId, visit.id, sessionId);
                    if (existingSession !== null) await this.repositories.visitSession.delete(au.churchId, existingSession.id);
                    const visitSessions = await this.repositories.visitSession.loadByVisitId(au.churchId, visit.id);
                    if (visitSessions.length === 0) await this.repositories.visit.delete(au.churchId, visit.id);
                }
                return this.json({});

            }
        });
    }

}
