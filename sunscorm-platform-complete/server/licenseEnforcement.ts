import { storage } from "./storage";
import { eq, count, and, sql } from "drizzle-orm";
import { db } from "./db";
import { dispatches, dispatchUsers, tenants } from "@shared/schema";

export interface LicenseConstraints {
  maxUsers?: number | null;
  maxCompletions?: number | null;
  expiresAt?: Date | null;
}

export interface LicenseEnforcementResult {
  allowed: boolean;
  reason?: string;
  constraints: {
    dispatch: LicenseConstraints;
    tenant: LicenseConstraints;
    effective: LicenseConstraints; // The constraints actually being enforced
  };
  usage: {
    uniqueUsers: number;
    totalCompletions: number;
    dispatchStats: {
      uniqueUsers: number;
      totalCompletions: number;
    };
    tenantStats: {
      uniqueUsers: number;
      totalCompletions: number;
    };
  };
}

export class LicenseEnforcementService {
  /**
   * Check if a user can access a dispatch based on license constraints
   */
  async canAccessDispatch(dispatchId: string, userEmail: string): Promise<LicenseEnforcementResult> {
    // Get dispatch and tenant information
    const dispatch = await storage.getDispatch(dispatchId);
    if (!dispatch) {
      throw new Error("Dispatch not found");
    }

    const tenant = await storage.getTenant(dispatch.tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    // Get current usage statistics
    const usage = await this.getUsageStats(dispatchId, dispatch.tenantId);
    
    // Define constraints at each level
    const dispatchConstraints: LicenseConstraints = {
      maxUsers: dispatch.maxUsers,
      maxCompletions: dispatch.maxCompletions,
      expiresAt: dispatch.expiresAt
    };

    const tenantConstraints: LicenseConstraints = {
      maxUsers: tenant.maxDispatchUsers,
      maxCompletions: tenant.maxCompletions,
      expiresAt: tenant.globalExpiration
    };

    // Calculate effective constraints (tenant overrides dispatch)
    const effectiveConstraints: LicenseConstraints = {
      maxUsers: this.getEffectiveConstraint(tenantConstraints.maxUsers, dispatchConstraints.maxUsers),
      maxCompletions: this.getEffectiveConstraint(tenantConstraints.maxCompletions, dispatchConstraints.maxCompletions),
      expiresAt: this.getEffectiveConstraint(tenantConstraints.expiresAt, dispatchConstraints.expiresAt)
    };

    // Check each constraint
    const result: LicenseEnforcementResult = {
      allowed: true,
      constraints: {
        dispatch: dispatchConstraints,
        tenant: tenantConstraints,
        effective: effectiveConstraints
      },
      usage
    };

    // Check expiration
    if (effectiveConstraints.expiresAt && new Date() > effectiveConstraints.expiresAt) {
      result.allowed = false;
      result.reason = "Dispatch has expired";
      return result;
    }

    // Check if user already has access (for unique user counting)
    const existingAccess = await this.hasUserAccess(dispatchId, userEmail);
    
    // Check max users constraint (only if user doesn't already have access)
    if (!existingAccess && effectiveConstraints.maxUsers) {
      const currentUsers = tenantConstraints.maxUsers !== null ? usage.tenantStats.uniqueUsers : usage.dispatchStats.uniqueUsers;
      if (currentUsers >= effectiveConstraints.maxUsers) {
        result.allowed = false;
        result.reason = `Maximum users exceeded (${effectiveConstraints.maxUsers} allowed)`;
        return result;
      }
    }

    // Check max completions constraint (always check as users can complete multiple times)
    if (effectiveConstraints.maxCompletions) {
      const currentCompletions = tenantConstraints.maxCompletions !== null ? usage.tenantStats.totalCompletions : usage.dispatchStats.totalCompletions;
      if (currentCompletions >= effectiveConstraints.maxCompletions) {
        result.allowed = false;
        result.reason = `Maximum completions exceeded (${effectiveConstraints.maxCompletions} allowed)`;
        return result;
      }
    }

    return result;
  }

  /**
   * Check if a user already has access to a dispatch
   */
  private async hasUserAccess(dispatchId: string, userEmail: string): Promise<boolean> {
    const [result] = await db
      .select({ count: count() })
      .from(dispatchUsers)
      .where(and(
        eq(dispatchUsers.dispatchId, dispatchId),
        eq(dispatchUsers.email, userEmail)
      ));
    
    return result.count > 0;
  }

  /**
   * Get usage statistics for a dispatch and its tenant
   */
  private async getUsageStats(dispatchId: string, tenantId: string): Promise<LicenseEnforcementResult['usage']> {
    // Dispatch-level statistics
    const [dispatchUserStats] = await db
      .select({ count: count() })
      .from(dispatchUsers)
      .where(eq(dispatchUsers.dispatchId, dispatchId));

    const [dispatchCompletionStats] = await db
      .select({ count: count() })
      .from(dispatchUsers)
      .where(and(
        eq(dispatchUsers.dispatchId, dispatchId),
        sql`completed_at IS NOT NULL`
      ));

    // Tenant-level statistics (across all ACTIVE dispatches only)
    const [tenantUserStats] = await db
      .select({ count: count() })
      .from(dispatchUsers)
      .where(sql`dispatch_id IN (SELECT id FROM dispatches WHERE tenant_id = ${tenantId} AND is_disabled = false)`);

    const [tenantCompletionStats] = await db
      .select({ count: count() })
      .from(dispatchUsers)
      .where(sql`dispatch_id IN (SELECT id FROM dispatches WHERE tenant_id = ${tenantId} AND is_disabled = false) AND completed_at IS NOT NULL`);

    return {
      uniqueUsers: tenantUserStats.count, // Use tenant-level for overall tracking
      totalCompletions: tenantCompletionStats.count,
      dispatchStats: {
        uniqueUsers: dispatchUserStats.count,
        totalCompletions: dispatchCompletionStats.count
      },
      tenantStats: {
        uniqueUsers: tenantUserStats.count,
        totalCompletions: tenantCompletionStats.count
      }
    };
  }

  /**
   * Get the effective constraint value (tenant takes precedence over dispatch)
   */
  private getEffectiveConstraint<T>(tenantValue: T | null, dispatchValue: T | null): T | null {
    // If tenant has a constraint, it overrides dispatch
    if (tenantValue !== null && tenantValue !== undefined) {
      return tenantValue;
    }
    
    // Otherwise, use dispatch constraint
    return dispatchValue;
  }

  /**
   * Validate constraints before creating/updating a dispatch
   */
  async validateDispatchConstraints(tenantId: string, constraints: LicenseConstraints): Promise<{ valid: boolean; message?: string }> {
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return { valid: false, message: "Tenant not found" };
    }

    // Check if dispatch constraints conflict with tenant constraints
    if (tenant.maxDispatchUsers !== null && constraints.maxUsers !== null) {
      if (constraints.maxUsers > tenant.maxDispatchUsers) {
        return { 
          valid: false, 
          message: `Dispatch max users (${constraints.maxUsers}) cannot exceed tenant limit (${tenant.maxDispatchUsers})` 
        };
      }
    }

    if (tenant.maxCompletions !== null && constraints.maxCompletions !== null) {
      if (constraints.maxCompletions > tenant.maxCompletions) {
        return { 
          valid: false, 
          message: `Dispatch max completions (${constraints.maxCompletions}) cannot exceed tenant limit (${tenant.maxCompletions})` 
        };
      }
    }

    if (tenant.globalExpiration !== null && constraints.expiresAt !== null) {
      if (constraints.expiresAt > tenant.globalExpiration) {
        return { 
          valid: false, 
          message: `Dispatch expiration cannot be later than tenant expiration (${tenant.globalExpiration.toISOString()})` 
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get comprehensive license information for a dispatch
   */
  async getDispatchLicenseInfo(dispatchId: string): Promise<LicenseEnforcementResult> {
    const dispatch = await storage.getDispatch(dispatchId);
    if (!dispatch) {
      throw new Error("Dispatch not found");
    }

    const tenant = await storage.getTenant(dispatch.tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const usage = await this.getUsageStats(dispatchId, dispatch.tenantId);
    
    const dispatchConstraints: LicenseConstraints = {
      maxUsers: dispatch.maxUsers,
      maxCompletions: dispatch.maxCompletions,
      expiresAt: dispatch.expiresAt
    };

    const tenantConstraints: LicenseConstraints = {
      maxUsers: tenant.maxDispatchUsers,
      maxCompletions: tenant.maxCompletions,
      expiresAt: tenant.globalExpiration
    };

    const effectiveConstraints: LicenseConstraints = {
      maxUsers: this.getEffectiveConstraint(tenantConstraints.maxUsers, dispatchConstraints.maxUsers),
      maxCompletions: this.getEffectiveConstraint(tenantConstraints.maxCompletions, dispatchConstraints.maxCompletions),
      expiresAt: this.getEffectiveConstraint(tenantConstraints.expiresAt, dispatchConstraints.expiresAt)
    };

    return {
      allowed: true, // This is just info, not access check
      constraints: {
        dispatch: dispatchConstraints,
        tenant: tenantConstraints,
        effective: effectiveConstraints
      },
      usage
    };
  }
}

export const licenseEnforcement = new LicenseEnforcementService();