import { registry } from "@/container.js";
import { jsonResponse, paginationValidator, validate } from "@repo/lib";
import { catchAsync, ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";

import {
	runFailuresEventValidator,
	createNotificationRuleValidator,
	testEmailValidator,
	updateNotificationRuleValidator,
} from "./notifications.validator.js";

export class NotificationsController {
	static listRules = catchAsync(async (req, res) => {
		const query = await validate(paginationValidator, req.query);
		const data = await registry.notificationsRepo.listRules(query);

		return res.json(jsonResponse("paginated", { items: data.data, pagination: data.pagination }));
	});

	static createRule = catchAsync(async (req, res) => {
		const payload = await validate(createNotificationRuleValidator, req.body);
		const rule = await registry.notificationsRepo.createRule(payload, req.user.id);

		return res.json(
			jsonResponse("mutation", {
				data: { rule },
				toast: { message: "Notification rule created" },
			}),
		);
	});

	static updateRule = catchAsync(async (req, res) => {
		const ruleId = req.query.ruleId as string;

		if (!ruleId) throw new ErrorResponse("Rule id missing", 400);

		const payload = await validate(updateNotificationRuleValidator, req.body);
		const rule = await registry.notificationsRepo.updateRule(ruleId, payload);

		return res.json(
			jsonResponse("mutation", {
				data: { rule },
				toast: { message: "Notification rule updated" },
			}),
		);
	});

	static toggleRule = catchAsync(async (req, res) => {
		const ruleId = req.query.ruleId as string;

		if (!ruleId) throw new ErrorResponse("Rule id missing", 400);

		const rule = await registry.notificationsRepo.toggleRule(ruleId);

		return res.json(
			jsonResponse("mutation", {
				data: { rule },
				toast: { message: rule?.enabled ? "Rule enabled" : "Rule disabled" },
			}),
		);
	});

	static deleteRule = catchAsync(async (req, res) => {
		const ruleId = req.query.ruleId as string;

		if (!ruleId) throw new ErrorResponse("Rule id missing", 400);

		await registry.notificationsRepo.deleteRule(ruleId);

		return res.json(
			jsonResponse("mutation", {
				data: { ruleId },
				toast: { message: "Notification rule deleted" },
			}),
		);
	});

	static sendTestEmail = catchAsync(async (req, res) => {
		const { to } = await validate(testEmailValidator, req.body);
		const result = await registry.notificationsRepo.sendTestEmail(to);

		return res.json(
			jsonResponse("mutation", {
				data: result,
				toast: { message: `Test email sent to ${to}` },
			}),
		);
	});

	/**
	 * Engine callback. Not behind the user session -- dc-engine has no user.
	 *
	 * Accepts a whole run's failures in one call. A body in the older single-failure
	 * shape is wrapped into a one-element batch, so both work.
	 *
	 * Always answers 202 once the payload is valid, even when nothing matched or
	 * the mail failed: this must never make the engine think the check run itself
	 * went wrong. The body reports what actually happened.
	 */
	static checkFailed = catchAsync(async (req, res) => {
		// Untrusted input, shaped loosely here and validated on the next line --
		// same as every other controller, which passes Express's `any` body straight in.
		const body = (req.body ?? {}) as any;

		const payload = Array.isArray(body.failures)
			? body
			: {
					configId: body.configId,
					configName: body.configName,
					jobId: body.jobId,
					runId: body.runId,
					failures: [
						{
							checkExecutionId: body.checkExecutionId,
							checkName: body.checkName,
							criticality: body.criticality,
							impactedDownstreamIds: body.impactedDownstreamIds,
							failureReason: body.failureReason,
							issueRows: body.issueRows,
							field: body.field,
						},
					],
				};

		const event = await validate(runFailuresEventValidator, payload);

		try {
			const result = await registry.notificationsRepo.notifyRunFailures(event);

			logger.info("Run failure notification processed", {
				configId: event.configId,
				jobId: event.jobId,
				failures: event.failures.length,
				...result,
			});

			return res.status(202).json(jsonResponse("mutation", { data: result }));
		} catch (error) {
			logger.error("Run failure notification failed", { error, configId: event.configId, jobId: event.jobId });

			return res
				.status(202)
				.json(jsonResponse("mutation", { data: { matchedRules: 0, emailsSent: 0, notifiedChecks: 0, error: true } }));
		}
	});
}
