import {
  users,
  tenants,
  courses,
  dispatches,
  dispatchUsers,
  xapiStatements,
  type User,
  type UpsertUser,
  type Tenant,
  type InsertTenant,
  type Course,
  type InsertCourse,
  type Dispatch,
  type InsertDispatch,
  type DispatchUser,
  type InsertDispatchUser,
  type XapiStatement,
  type InsertXapiStatement,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, count, sql } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Tenant operations
  getTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant>;
  deleteTenant(id: string): Promise<void>;
  
  // Course operations
  getCourses(tenantId?: string): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: string, course: Partial<InsertCourse>): Promise<Course>;
  deleteCourse(id: string): Promise<void>;
  
  // Dispatch operations
  getDispatches(tenantId?: string, includeDisabled?: boolean, courseId?: string): Promise<Dispatch[]>;
  getDispatch(id: string): Promise<Dispatch | undefined>;
  createDispatch(dispatch: InsertDispatch): Promise<Dispatch>;
  updateDispatch(id: string, dispatch: Partial<InsertDispatch>): Promise<Dispatch>;
  deleteDispatch(id: string): Promise<void>;
  softDeleteDispatch(id: string): Promise<Dispatch>;
  findActiveDispatch(courseId: string, tenantId: string): Promise<Dispatch | undefined>;
  
  // Dispatch User operations
  getDispatchUsers(dispatchId: string): Promise<DispatchUser[]>;
  getDispatchUser(id: string): Promise<DispatchUser | undefined>;
  getDispatchUserByToken(token: string): Promise<DispatchUser | undefined>;
  createDispatchUser(dispatchUser: InsertDispatchUser): Promise<DispatchUser>;
  updateDispatchUser(id: string, dispatchUser: Partial<InsertDispatchUser>): Promise<DispatchUser>;
  
  // xAPI operations
  getXapiStatements(dispatchId: string): Promise<XapiStatement[]>;
  createXapiStatement(statement: InsertXapiStatement): Promise<XapiStatement>;
  
  // Analytics operations
  getDashboardStats(tenantId?: string): Promise<{
    totalCourses: number;
    activeDispatches: number;
    totalLaunches: number;
    completionRate: number;
  }>;
  
  getRecentDispatches(tenantId?: string, limit?: number): Promise<Dispatch[]>;
  
  getStandardsDistribution(tenantId?: string): Promise<Array<{
    name: string;
    value: number;
    percentage: number;
    color: string;
  }>>;
  
  // Search operations
  globalSearch(query: string, type?: string, tenantId?: string): Promise<{
    courses: Array<{ id: string; title: string; description: string; type: 'course' }>;
    dispatches: Array<{ id: string; name: string; status: string; type: 'dispatch' }>;
    users: Array<{ id: string; firstName: string; lastName: string; email: string; type: 'user' }>;
    tenants: Array<{ id: string; name: string; type: 'tenant' }>;
  }>;
  
  // Conflict checking
  findDispatchConflictsByTitle(title: string, userTenantId?: string): Promise<Array<{
    id: string;
    name: string;
    tenantId: string;
    tenantName: string;
  }>>;
  
  // System health operations
  getSystemHealth(): Promise<{
    database: { status: 'healthy' | 'unhealthy'; responseTime: number };
    storage: { status: 'healthy' | 'unhealthy'; totalCourses: number };
    auth: { status: 'healthy' | 'unhealthy' };
    lastUpdated: Date;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Tenant operations
  async getTenants(): Promise<Tenant[]> {
    return await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  async updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant> {
    const [updatedTenant] = await db
      .update(tenants)
      .set({ ...tenant, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return updatedTenant;
  }

  async deleteTenant(id: string): Promise<void> {
    await db.delete(tenants).where(eq(tenants.id, id));
  }

  // Course operations
  async getCourses(tenantId?: string, includeDeleted?: boolean): Promise<Course[]> {
    const conditions = [];
    
    if (tenantId) {
      conditions.push(eq(courses.tenantId, tenantId));
    }
    
    if (!includeDeleted) {
      conditions.push(eq(courses.isDisabled, false));
    }
    
    const query = db.select().from(courses);
    
    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(courses.createdAt));
    }
    
    return await query.orderBy(desc(courses.createdAt));
  }

  async getCourse(id: string): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.id, id));
    return course;
  }

  async createCourse(course: InsertCourse): Promise<Course> {
    const [newCourse] = await db.insert(courses).values(course).returning();
    return newCourse;
  }

  async updateCourse(id: string, course: Partial<InsertCourse>): Promise<Course> {
    const [updatedCourse] = await db
      .update(courses)
      .set({ ...course, updatedAt: new Date() })
      .where(eq(courses.id, id))
      .returning();
    return updatedCourse;
  }

  async deleteCourse(id: string): Promise<void> {
    await db.delete(courses).where(eq(courses.id, id));
  }

  async softDeleteCourse(id: string): Promise<Course> {
    const [updatedCourse] = await db
      .update(courses)
      .set({ 
        isDisabled: true, 
        deletedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(courses.id, id))
      .returning();
    return updatedCourse;
  }

  async checkCourseActiveDispatches(courseId: string): Promise<{ hasActiveDispatches: boolean; activeCount: number }> {
    const [result] = await db
      .select({ count: count() })
      .from(dispatches)
      .where(and(
        eq(dispatches.courseId, courseId),
        eq(dispatches.isDisabled, false)
      ));
    
    const activeCount = result?.count || 0;
    return {
      hasActiveDispatches: activeCount > 0,
      activeCount
    };
  }

  // Dispatch operations
  async getDispatches(tenantId?: string, includeDisabled?: boolean, courseId?: string): Promise<Dispatch[]> {
    const conditions = [];
    
    if (tenantId) {
      conditions.push(eq(dispatches.tenantId, tenantId));
    }
    
    if (courseId) {
      conditions.push(eq(dispatches.courseId, courseId));
    }
    
    if (!includeDisabled) {
      conditions.push(eq(dispatches.isDisabled, false));
    }
    
    const query = db.select().from(dispatches);
    
    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(dispatches.createdAt));
    }
    
    return await query.orderBy(desc(dispatches.createdAt));
  }

  async getDispatch(id: string): Promise<Dispatch | undefined> {
    const [dispatch] = await db.select().from(dispatches).where(eq(dispatches.id, id));
    return dispatch;
  }

  async createDispatch(dispatch: InsertDispatch): Promise<Dispatch> {
    const [newDispatch] = await db.insert(dispatches).values(dispatch).returning();
    return newDispatch;
  }

  async updateDispatch(id: string, dispatch: Partial<InsertDispatch>): Promise<Dispatch> {
    const [updatedDispatch] = await db
      .update(dispatches)
      .set({ ...dispatch, updatedAt: new Date() })
      .where(eq(dispatches.id, id))
      .returning();
    return updatedDispatch;
  }

  async deleteDispatch(id: string): Promise<void> {
    await db.delete(dispatches).where(eq(dispatches.id, id));
  }

  async softDeleteDispatch(id: string): Promise<Dispatch> {
    const [updatedDispatch] = await db
      .update(dispatches)
      .set({ 
        isDisabled: true, 
        deletedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(dispatches.id, id))
      .returning();
    return updatedDispatch;
  }

  async findActiveDispatch(courseId: string, tenantId: string): Promise<Dispatch | undefined> {
    const [dispatch] = await db
      .select()
      .from(dispatches)
      .where(and(
        eq(dispatches.courseId, courseId),
        eq(dispatches.tenantId, tenantId),
        eq(dispatches.isDisabled, false)
      ));
    return dispatch;
  }

  // Dispatch User operations
  async getDispatchUsers(dispatchId: string): Promise<DispatchUser[]> {
    return await db
      .select()
      .from(dispatchUsers)
      .where(eq(dispatchUsers.dispatchId, dispatchId))
      .orderBy(desc(dispatchUsers.createdAt));
  }

  async getDispatchUser(id: string): Promise<DispatchUser | undefined> {
    const [dispatchUser] = await db.select().from(dispatchUsers).where(eq(dispatchUsers.id, id));
    return dispatchUser;
  }

  async getDispatchUserByToken(token: string): Promise<DispatchUser | undefined> {
    const [dispatchUser] = await db.select().from(dispatchUsers).where(eq(dispatchUsers.launchToken, token));
    return dispatchUser;
  }

  async createDispatchUser(dispatchUser: InsertDispatchUser): Promise<DispatchUser> {
    const [newDispatchUser] = await db.insert(dispatchUsers).values(dispatchUser).returning();
    return newDispatchUser;
  }

  async updateDispatchUser(id: string, dispatchUser: Partial<InsertDispatchUser>): Promise<DispatchUser> {
    const [updatedDispatchUser] = await db
      .update(dispatchUsers)
      .set(dispatchUser)
      .where(eq(dispatchUsers.id, id))
      .returning();
    return updatedDispatchUser;
  }

  // xAPI operations
  async getXapiStatements(dispatchId: string): Promise<XapiStatement[]> {
    return await db
      .select()
      .from(xapiStatements)
      .where(eq(xapiStatements.dispatchId, dispatchId))
      .orderBy(desc(xapiStatements.timestamp));
  }

  async createXapiStatement(statement: InsertXapiStatement): Promise<XapiStatement> {
    const [newStatement] = await db.insert(xapiStatements).values(statement).returning();
    return newStatement;
  }

  // Analytics operations
  async getDashboardStats(tenantId?: string): Promise<{
    totalCourses: number;
    activeDispatches: number;
    totalLaunches: number;
    completionRate: number;
  }> {
    // Build queries with proper conditional logic
    const courseQuery = tenantId 
      ? db.select({ count: count() }).from(courses).where(eq(courses.tenantId, tenantId))
      : db.select({ count: count() }).from(courses);
    
    const dispatchQuery = tenantId
      ? db.select({ count: count() }).from(dispatches).where(and(eq(dispatches.tenantId, tenantId), eq(dispatches.status, 'active'), eq(dispatches.isDisabled, false)))
      : db.select({ count: count() }).from(dispatches).where(and(eq(dispatches.status, 'active'), eq(dispatches.isDisabled, false)));
    
    const launchQuery = tenantId
      ? db.select({ count: count() }).from(dispatchUsers).where(sql`dispatch_id IN (SELECT id FROM dispatches WHERE tenant_id = ${tenantId} AND is_disabled = false) AND launched_at IS NOT NULL`)
      : db.select({ count: count() }).from(dispatchUsers).where(sql`dispatch_id IN (SELECT id FROM dispatches WHERE is_disabled = false) AND launched_at IS NOT NULL`);
    
    const completionQuery = tenantId
      ? db.select({ count: count() }).from(dispatchUsers).where(sql`dispatch_id IN (SELECT id FROM dispatches WHERE tenant_id = ${tenantId} AND is_disabled = false) AND completed_at IS NOT NULL`)
      : db.select({ count: count() }).from(dispatchUsers).where(sql`dispatch_id IN (SELECT id FROM dispatches WHERE is_disabled = false) AND completed_at IS NOT NULL`);

    const [courseCount, dispatchCount, launchCount, completionCount] = await Promise.all([
      courseQuery,
      dispatchQuery,
      launchQuery,
      completionQuery,
    ]);

    const totalLaunches = launchCount[0].count;
    const totalCompletions = completionCount[0].count;
    const completionRate = totalLaunches > 0 ? (totalCompletions / totalLaunches) * 100 : 0;

    return {
      totalCourses: courseCount[0].count,
      activeDispatches: dispatchCount[0].count,
      totalLaunches: totalLaunches,
      completionRate: Math.round(completionRate * 10) / 10,
    };
  }

  async getRecentDispatches(tenantId?: string, limit: number = 10): Promise<Dispatch[]> {
    const query = db.select().from(dispatches).limit(limit).orderBy(desc(dispatches.createdAt));
    
    if (tenantId) {
      return await query.where(and(eq(dispatches.tenantId, tenantId), eq(dispatches.isDisabled, false)));
    }
    
    return await query.where(eq(dispatches.isDisabled, false));
  }

  // Search operations
  async globalSearch(query: string, type?: string, tenantId?: string): Promise<{
    courses: Array<{ id: string; title: string; description: string; type: 'course' }>;
    dispatches: Array<{ id: string; name: string; status: string; type: 'dispatch' }>;
    users: Array<{ id: string; firstName: string; lastName: string; email: string; type: 'user' }>;
    tenants: Array<{ id: string; name: string; type: 'tenant' }>;
  }> {
    const searchTerm = `%${query.toLowerCase()}%`;
    
    // Build search promises based on type filter
    const promises = [];
    
    if (!type || type === 'course') {
      const courseQuery = tenantId 
        ? db.select({ id: courses.id, title: courses.title, description: courses.description })
           .from(courses)
           .where(and(
             eq(courses.tenantId, tenantId),
             sql`(LOWER(${courses.title}) LIKE ${searchTerm} OR LOWER(${courses.description}) LIKE ${searchTerm})`
           ))
        : db.select({ id: courses.id, title: courses.title, description: courses.description })
           .from(courses)
           .where(sql`(LOWER(${courses.title}) LIKE ${searchTerm} OR LOWER(${courses.description}) LIKE ${searchTerm})`);
      
      promises.push(courseQuery);
    } else {
      promises.push(Promise.resolve([]));
    }
    
    if (!type || type === 'dispatch') {
      const dispatchQuery = tenantId
        ? db.select({ id: dispatches.id, name: dispatches.name, status: dispatches.status })
           .from(dispatches)
           .where(and(
             eq(dispatches.tenantId, tenantId),
             eq(dispatches.isDisabled, false),
             sql`LOWER(${dispatches.name}) LIKE ${searchTerm}`
           ))
        : db.select({ id: dispatches.id, name: dispatches.name, status: dispatches.status })
           .from(dispatches)
           .where(and(
             eq(dispatches.isDisabled, false),
             sql`LOWER(${dispatches.name}) LIKE ${searchTerm}`
           ));
      
      promises.push(dispatchQuery);
    } else {
      promises.push(Promise.resolve([]));
    }
    
    if (!type || type === 'user') {
      const userQuery = tenantId
        ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
           .from(users)
           .where(and(
             eq(users.tenantId, tenantId),
             sql`(LOWER(${users.firstName}) LIKE ${searchTerm} OR LOWER(${users.lastName}) LIKE ${searchTerm} OR LOWER(${users.email}) LIKE ${searchTerm})`
           ))
        : db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
           .from(users)
           .where(sql`(LOWER(${users.firstName}) LIKE ${searchTerm} OR LOWER(${users.lastName}) LIKE ${searchTerm} OR LOWER(${users.email}) LIKE ${searchTerm})`);
      
      promises.push(userQuery);
    } else {
      promises.push(Promise.resolve([]));
    }
    
    if (!type || type === 'tenant') {
      const tenantQuery = db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(sql`LOWER(${tenants.name}) LIKE ${searchTerm}`);
      
      promises.push(tenantQuery);
    } else {
      promises.push(Promise.resolve([]));
    }
    
    const [courseResults, dispatchResults, userResults, tenantResults] = await Promise.all(promises);
    
    return {
      courses: (courseResults as any[]).map(c => ({ 
        id: c.id, 
        title: c.title, 
        description: c.description || '', 
        type: 'course' as const 
      })),
      dispatches: (dispatchResults as any[]).map(d => ({ 
        id: d.id, 
        name: d.name, 
        status: d.status, 
        type: 'dispatch' as const 
      })),
      users: (userResults as any[]).map(u => ({ 
        id: u.id, 
        firstName: u.firstName || '', 
        lastName: u.lastName || '', 
        email: u.email || '', 
        type: 'user' as const 
      })),
      tenants: (tenantResults as any[]).map(t => ({ 
        id: t.id, 
        name: t.name, 
        type: 'tenant' as const 
      })),
    };
  }

  async getStandardsDistribution(tenantId?: string): Promise<Array<{
    name: string;
    value: number;
    percentage: number;
    color: string;
  }>> {
    // Get distribution of scorm types from courses
    const whereClause = tenantId ? eq(courses.tenantId, tenantId) : undefined;
    
    const distributionQuery = await db
      .select({
        scormType: courses.scormType,
        count: count(),
      })
      .from(courses)
      .where(whereClause)
      .groupBy(courses.scormType);

    const total = distributionQuery.reduce((sum, item) => sum + item.count, 0);
    
    if (total === 0) {
      return [];
    }

    // Define the standard mapping with consistent colors
    const standardMapping: Record<string, { name: string; color: string }> = {
      'scorm_1_2': { name: 'SCORM 1.2', color: 'bg-primary' },
      'scorm_2004': { name: 'SCORM 2004', color: 'bg-yellow-600' },
      'aicc': { name: 'AICC', color: 'bg-green-600' },
      'xapi': { name: 'xAPI', color: 'bg-purple-600' },
      'cmi5': { name: 'cmi5', color: 'bg-blue-600' },
    };

    return distributionQuery.map(item => {
      const standard = standardMapping[item.scormType] || { name: item.scormType, color: 'bg-gray-600' };
      const percentage = Math.round((item.count / total) * 100 * 10) / 10; // Round to 1 decimal place
      
      return {
        name: standard.name,
        value: item.count,
        percentage,
        color: standard.color,
      };
    }).sort((a, b) => b.percentage - a.percentage); // Sort by percentage descending
  }

  // Conflict checking operations
  async findDispatchConflictsByTitle(title: string, userTenantId?: string): Promise<Array<{
    id: string;
    name: string;
    tenantId: string;
    tenantName: string;
  }>> {
    const searchTerm = `%${title.toLowerCase()}%`;
    
    // Find dispatches with similar course titles that are not disabled
    const conflictQuery = await db
      .select({
        id: dispatches.id,
        name: dispatches.name,
        tenantId: dispatches.tenantId,
        tenantName: tenants.name,
        courseTitle: courses.title
      })
      .from(dispatches)
      .innerJoin(courses, eq(dispatches.courseId, courses.id))
      .innerJoin(tenants, eq(dispatches.tenantId, tenants.id))
      .where(and(
        eq(dispatches.isDisabled, false),
        sql`LOWER(${courses.title}) LIKE ${searchTerm}`
      ));

    return conflictQuery.map(c => ({
      id: c.id,
      name: c.name,
      tenantId: c.tenantId,
      tenantName: c.tenantName
    }));
  }

  // System health operations
  async getSystemHealth(): Promise<{
    database: { status: 'healthy' | 'unhealthy'; responseTime: number };
    storage: { status: 'healthy' | 'unhealthy'; totalCourses: number };
    auth: { status: 'healthy' | 'unhealthy' };
    lastUpdated: Date;
  }> {
    const startTime = Date.now();
    
    try {
      // Test database connection
      const dbStartTime = Date.now();
      const [courseCount] = await db.select({ count: count() }).from(courses);
      const dbResponseTime = Date.now() - dbStartTime;
      
      return {
        database: { status: 'healthy', responseTime: dbResponseTime },
        storage: { status: 'healthy', totalCourses: courseCount.count },
        auth: { status: 'healthy' }, // Assuming auth is healthy if we reach this point
        lastUpdated: new Date(),
      };
    } catch (error) {
      const dbResponseTime = Date.now() - startTime;
      return {
        database: { status: 'unhealthy', responseTime: dbResponseTime },
        storage: { status: 'unhealthy', totalCourses: 0 },
        auth: { status: 'unhealthy' },
        lastUpdated: new Date(),
      };
    }
  }
}

export const storage = new DatabaseStorage();
