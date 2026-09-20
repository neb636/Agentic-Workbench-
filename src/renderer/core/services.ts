import { CommandRegistry } from "./command-registry";
import { PromptAssembler } from "./prompt-assembler";
import { SessionProviderRegistry } from "./session-provider-registry";
import { ViewRegistry } from "./view-registry";
import { WidgetRegistry } from "./widget-registry";

export const services = {
  views: new ViewRegistry(),
  sessions: new SessionProviderRegistry(),
  commands: new CommandRegistry(),
  widgets: new WidgetRegistry(),
  promptAssembler: new PromptAssembler(),
};
