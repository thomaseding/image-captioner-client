
export type SubjectID = string;

export interface SubjectInfo {
  id: SubjectID;
  imagePath: string;
  caption: string;
}

export type Action
  = ActionUpdateSubject
  | ActionGetSubjectInfo
  | ActionGetSubjectIDs
  ;

export type ActionUpdateSubject = { action: "update"; json: SubjectInfo };
export type ActionGetSubjectInfo = { action: "getSubjectInfo"; id: SubjectID };
export type ActionGetSubjectIDs = { action: "getSubjectIDs" };
