import { sendAction } from "./api";
import { registerMagnify } from "./magnify";
import { PromiseQueue } from "./promise-queue";
import { SubjectID, SubjectInfo } from "./types";

enum Completion {
  Error,
  NotDone,
  Done,
}

function flashRedScreen() {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
  overlay.style.zIndex = '9999';
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.2s';
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = '1';
  }, 0);

  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 100);
  }, 150);
}

export class App {
  private readonly _subjectDropdown: HTMLSelectElement;
  private readonly _prevSubjectButton: HTMLButtonElement;
  private readonly _nextSubjectButton: HTMLButtonElement;

  private readonly _image: HTMLImageElement;
  private readonly _captionTextArea: HTMLTextAreaElement;

  private _promiseQueue: PromiseQueue = new PromiseQueue();

  private _allSubjects: SubjectInfo[] = [];
  private _currentSubjectIndex = -1;

  public constructor() {
    const subjectDropdown = document.getElementById("subject-dropdown") as HTMLSelectElement | null;
    if (!subjectDropdown) throw new Error("Subject dropdown not found");
    this._subjectDropdown = subjectDropdown;

    const prevSubjectButton = document.getElementById("prev-subject-button") as HTMLButtonElement | null;
    if (!prevSubjectButton) throw new Error("Prev subject button not found");
    this._prevSubjectButton = prevSubjectButton;

    const nextSubjectButton = document.getElementById("next-subject-button") as HTMLButtonElement | null;
    if (!nextSubjectButton) throw new Error("Next subject button not found");
    this._nextSubjectButton = nextSubjectButton;

    const image = document.getElementById("subject-image") as HTMLImageElement | null;
    if (!image) throw new Error("Image not found");
    this._image = image;

    const captionTextArea = document.getElementById("caption-textarea") as HTMLTextAreaElement | null;
    if (!captionTextArea) throw new Error("Caption container not found");
    this._captionTextArea = captionTextArea;

    this._prevSubjectButton.addEventListener("click", async () => {
      await this._promiseQueue.add(() => this._advanceToPrevSubject());
    });
    this._nextSubjectButton.addEventListener("click", async () => {
      await this._promiseQueue.add(() => this._advanceToNextSubject());
    });
    this._subjectDropdown.addEventListener("change", () => this._onDropdownSelection());
  }

  public async init(): Promise<void> {
    const subjectIDs = await sendAction({ action: "getSubjectIDs" }) as SubjectID[];
    if (subjectIDs.length === 0) {
      await this._displayCompletionMessage();
      return;
    }

    for (const id of subjectIDs) {
      const info = await sendAction({ action: "getSubjectInfo", id: id }) as SubjectInfo;
      this._allSubjects.push(info);
      const option = document.createElement("option");
      option.value = info.id.toString();
      option.text = `${info.imagePath}`;
      this._subjectDropdown.add(option);
    }

    await this._useSubjectInfo(this._allSubjects[0].id);
    registerMagnify();
  }

  private async _useSubjectInfo(id: SubjectID | null): Promise<void> {
    console.log("useSubjectInfo", "id", id);
    await this._postUpdateSubject();
    if (id === null) {
      this._currentSubjectIndex = -1;
      this._image.style.display = "none";
      console.log("useSubjectInfo", "no subject");
      return;
    }
    const index = this._getSubjectIndex(id);
    const info = this._allSubjects[index];
    this._currentSubjectIndex = index;
    this._image.src = `http://localhost:3000/${info.imagePath}`;
    this._captionTextArea.value = info.caption;
    console.log("useSubjectInfo", "done");
  }

  private _currentSubject(): SubjectInfo | null {
    if (this._currentSubjectIndex < 0 || this._currentSubjectIndex >= this._allSubjects.length) {
      return null;
    }
    return this._allSubjects[this._currentSubjectIndex];
  }

  private _getSubjectIndex(subjectId: SubjectID): number {
    const index = this._allSubjects.findIndex(x => x.id === subjectId);
    if (index < 0 || index >= this._allSubjects.length) {
      throw new Error(`Invalid subject id: ${subjectId}`);
    }
    return index;
  }

  private _decodeSelectedSubject(): SubjectID {
    const selectedIndex = this._subjectDropdown.selectedIndex;
    const selectedSubjectId = this._subjectDropdown.options[selectedIndex].value;
    return selectedSubjectId;
  }

  public async _goToSubjectByIndex(subjectIndex: number | null): Promise<Completion> {
    console.log("goToSubjectByIndex", "index", subjectIndex);
    if (subjectIndex === null) {
      await this._useSubjectInfo(null);
      await this._displayCompletionMessage();
      console.log("goToSubjectByIndex", "done");
      return Completion.Done;
    }
    if (subjectIndex < 0 || subjectIndex >= this._allSubjects.length) {
      throw new Error(`Invalid subject index: ${subjectIndex}`);
    }
    const subjectId = this._allSubjects[subjectIndex].id;
    await this._useSubjectInfo(subjectId);
    this._subjectDropdown.selectedIndex = subjectIndex;
    console.log("goToSubjectByIndex", "done");
    return Completion.NotDone;
  }

  public async _goToSubjectByID(subjectId: SubjectID | null): Promise<Completion> {
    let subjectIndex: number | null = null;
    if (subjectId !== null) {
      subjectIndex = this._getSubjectIndex(subjectId);
    }
    return await this._goToSubjectByIndex(subjectIndex);
  }

  private async _onDropdownSelection(): Promise<void> {
    const subjectId = this._decodeSelectedSubject();
    await this._goToSubjectByID(subjectId);
  }

  private async _advanceToPrevSubject(): Promise<Completion> {
    if (this._currentSubjectIndex < 0 || this._currentSubjectIndex >= this._allSubjects.length) {
      throw new Error("No current subject");
    }
    const index = this._currentSubjectIndex - 1;
    if (index < 0) {
      await this._postUpdateSubject();
      console.log("Already at the first image");
      flashRedScreen();
      return Completion.Error;
    }
    return await this._goToSubjectByIndex(index);
  }

  private async _advanceToNextSubject(): Promise<Completion> {
    if (this._currentSubjectIndex < 0 || this._currentSubjectIndex >= this._allSubjects.length) {
      throw new Error("No current subject");
    }
    const index = this._currentSubjectIndex + 1;
    if (index >= this._allSubjects.length) {
      await this._postUpdateSubject();
      console.log("Already at the last image");
      flashRedScreen();
      return Completion.Error;
    }
    return await this._goToSubjectByIndex(index);
  }

  private async _postUpdateSubject(): Promise<void> {
    const currentSubject = this._currentSubject();
    if (!currentSubject) {
      return;
    }
    currentSubject.caption = this._captionTextArea.value;
    await sendAction({ action: "update", json: currentSubject });
  }

  private async _displayCompletionMessage(): Promise<void> {
    const categoryContainer = document.getElementById("category-container");
    if (!categoryContainer) throw new Error("No category container found");
    categoryContainer.innerHTML = "<h2>All categories completed!</h2>";
  }

}
