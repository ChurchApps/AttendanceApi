import { controller, httpPost, httpGet, interfaces, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController"
import { ServiceTime, GroupServiceTime } from "../models"
import { Permissions } from "../helpers";

@controller("/servicetimes")
export class ServiceTimeController extends AttendanceBaseController {

    @httpGet("/search")
    public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            const campusId = req.query.campusId.toString();
            const serviceId = req.query.serviceId.toString();
            return this.repositories.serviceTime.convertAllToModel(au.churchId, await this.repositories.serviceTime.loadByChurchCampusService(au.churchId, campusId, serviceId));
        });
    }

    @httpGet("/:id")
    public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            return this.repositories.serviceTime.convertToModel(au.churchId, await this.repositories.serviceTime.load(au.churchId, id));
        });
    }

    @httpGet("/")
    public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            // return await this.repositories.serviceTime.loadAll(au.churchId);
            let result = null;
            if (req.query.serviceId !== undefined) result = await this.repositories.serviceTime.loadNamesByServiceId(au.churchId, req.query.serviceId.toString());
            else result = await this.repositories.serviceTime.loadNamesWithCampusService(au.churchId);
            result = this.repositories.serviceTime.convertAllToModel(au.churchId, result);
            if (result.length > 0 && this.include(req, "groups")) await this.appendGroups(au.churchId, result);
            return result;
        });
    }

    @httpPost("/")
    public async save(req: express.Request<{}, {}, ServiceTime[]>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
            else {
                const promises: Promise<ServiceTime>[] = [];
                req.body.forEach(servicetime => { servicetime.churchId = au.churchId; promises.push(this.repositories.serviceTime.save(servicetime)); });
                const result = await Promise.all(promises);
                return this.repositories.serviceTime.convertAllToModel(au.churchId, result);
            }
        });
    }

    @httpDelete("/:id")
    public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<interfaces.IHttpActionResult> {
        return this.actionWrapper(req, res, async (au) => {
            if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
            else {
                await this.repositories.serviceTime.delete(au.churchId, id);
                return this.json({});
            }
        });
    }

    private async appendGroups(churchId: string, times: ServiceTime[]) {
        const timeIds: string[] = [];
        times.forEach(t => { timeIds.push(t.id) });
        const allGroupServiceTimes: GroupServiceTime[] = await this.repositories.groupServiceTime.loadByServiceTimeIds(churchId, timeIds);
        const allGroupIds: string[] = [];
        allGroupServiceTimes.forEach(gst => { if (allGroupIds.indexOf(gst.groupId) === -1) allGroupIds.push(gst.groupId); });

        // todo replace
        /*
        const allGroups: any[] = await this.repositories.group.loadByIds(churchId, allGroupIds);
        times.forEach(t => {
            const groups: Group[] = [];
            allGroupServiceTimes.forEach(gst => {
                if (gst.serviceTimeId === t.id) {
                    allGroups.forEach(g => { if (g.id === gst.groupId) groups.push(g); });
                }
            });
            t.groups = groups;
        });
        */
    }







}
