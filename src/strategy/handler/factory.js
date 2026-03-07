export default class StrategyHandlerFactory {
  /**
   * @param {WorkerRuntime} runtime
   * @param {typeof StrategyHandler} [HandlerClass]
   */
  constructor(runtime, HandlerClass = null) {
    this.runtime = runtime;
    this.HandlerClass = HandlerClass;
  }

  /**
   *
   * @param {Strategy} strategy
   * @param {StrategyHandler} initialHandler
   * @return {StrategyHandler|*}
   */
  build(strategy, initialHandler) {
    if (!this.HandlerClass) {
      return initialHandler;
    }
    const {event, url, request, params} = initialHandler;
    return new this.HandlerClass(this.runtime, strategy, {event, url, request, params});
  }
}
