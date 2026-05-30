from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-mcp")

# TODO: @mcp.tool() / @mcp.resource() / @mcp.prompt() here.

if __name__ == "__main__":
    mcp.run()
